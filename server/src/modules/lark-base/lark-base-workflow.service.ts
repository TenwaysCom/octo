import { LarkClient, type LarkBitableRecord } from "../../adapters/lark/lark-client.js";
import { getSharedLarkTokenStore } from "../../adapters/postgres/lark-token-store.js";
import type { LarkTokenStore } from "../../adapters/lark/token-store.js";
import { refreshLarkToken } from "../lark-auth/lark-auth.service.js";
import { executeMeegleApply, type MeegleApplyErrorCode } from "../../application/services/meegle-apply.service.js";
import { buildAuthenticatedLarkClient, type AuthenticatedLarkClientFactoryDeps } from "../../application/services/lark-auth-client.factory.js";
import { getLarkRecordUrl, updateLarkBaseMeegleLink } from "./lark-base.service.js";
import type { CreateLarkBaseWorkflowRequest } from "./lark-base-workflow.dto.js";
import type { ExecutionDraft } from "../../validators/agent-output/execution-draft.js";
import {
  loadLarkBaseWorkflowConfig,
  type LarkBaseWorkflowConfig,
  type FieldMappingConfig,
  type FieldMappingSourceConfig,
} from "./lark-base-workflow-config.js";
import { logger } from "../../logger.js";

const workflowLogger = logger.child({ module: "lark-base-workflow-service" });

// ==================== Environment Defaults ====================

const DEFAULT_BASE_ID = process.env.LARK_BASE_DEFAULT_BASE_ID || "";
const DEFAULT_TABLE_ID = process.env.LARK_BASE_DEFAULT_TABLE_ID || "";
const DEFAULT_PROJECT_KEY = process.env.MEEGLE_PROJECT_KEY || "4c3fv6";
const MEEGLE_BASE_URL = process.env.MEEGLE_BASE_URL || "https://project.larksuite.com";

// Issue type labels from Lark Base
const ISSUE_TYPE_STORY = process.env.LARK_BASE_ISSUE_TYPE_STORY || "User Story";
const ISSUE_TYPE_TECH_TASK = process.env.LARK_BASE_ISSUE_TYPE_TECH_TASK || "Tech Task";
const ISSUE_TYPE_PROD_BUG = process.env.LARK_BASE_ISSUE_TYPE_PROD_BUG || "Production Bug";

// Meegle workitem type mappings
const WORKITEM_TYPE_KEY_STORY = process.env.MEEGLE_WORKITEM_TYPE_KEY_STORY || "story";
const TEMPLATE_ID_STORY = process.env.MEEGLE_TEMPLATE_ID_STORY || "400329";
const WORKITEM_TYPE_KEY_TECH_TASK = process.env.MEEGLE_WORKITEM_TYPE_KEY_TECH_TASK || "";
const TEMPLATE_ID_TECH_TASK = process.env.MEEGLE_TEMPLATE_ID_TECH_TASK || "";
const WORKITEM_TYPE_KEY_PROD_BUG = process.env.MEEGLE_WORKITEM_TYPE_KEY_PROD_BUG || "6932e40429d1cd8aac635c82";
const TEMPLATE_ID_PROD_BUG = process.env.MEEGLE_TEMPLATE_ID_PROD_BUG || "645025";

// Fallback when Issue 类型 is empty or unrecognized
const DEFAULT_ISSUE_TYPE_FALLBACK = process.env.LARK_BASE_DEFAULT_ISSUE_TYPE_FALLBACK || ISSUE_TYPE_PROD_BUG;

// Meegle custom field keys for Lark link fields (must match meegle-lark-push.service.ts)
const FIELD_LARK_RECORD_LINK = "field_e8ad0a";
const FIELD_LARK_MESSAGE_LINK = "field_8d0341";
const LARK_MESSAGE_LINK_PATTERN = "https?:\\/\\/[^\\s\"<>]*(?:threadid|chatid|messageid)=[^\\s\"<>]*";
const URL_IN_TEXT_PATTERN = /https?:\/\/[^\s"'<>)\]]+/i;
const MARKDOWN_LINK_HREF_PATTERN = /\[[^\]]*]\((https?:\/\/[^\s"'<>)]*)\)/i;

interface IssueTypeMappingConfig {
  larkLabels: string[];
  workitemTypeKey: string;
  templateId: string;
  urlSlug?: string;
}

function parseIssueTypeMappings(): IssueTypeMappingConfig[] {
  const raw = process.env.LARK_BASE_ISSUE_TYPE_MAPPINGS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as IssueTypeMappingConfig[];
      if (Array.isArray(parsed)) {
        workflowLogger.info({ count: parsed.length, parsed }, "PARSE_ISSUE_TYPE_MAPPINGS json_config");
        return parsed;
      }
    } catch {
      // fall through to legacy env vars
    }
  }

  const mappings: IssueTypeMappingConfig[] = [
    {
      larkLabels: [ISSUE_TYPE_STORY],
      workitemTypeKey: WORKITEM_TYPE_KEY_STORY,
      templateId: TEMPLATE_ID_STORY,
      urlSlug: WORKITEM_TYPE_KEY_STORY,
    },
  ];

  if (WORKITEM_TYPE_KEY_TECH_TASK) {
    mappings.push({
      larkLabels: [ISSUE_TYPE_TECH_TASK],
      workitemTypeKey: WORKITEM_TYPE_KEY_TECH_TASK,
      templateId: TEMPLATE_ID_TECH_TASK,
      urlSlug: WORKITEM_TYPE_KEY_TECH_TASK,
    });
  }

  mappings.push({
    larkLabels: [ISSUE_TYPE_PROD_BUG],
    workitemTypeKey: WORKITEM_TYPE_KEY_PROD_BUG,
    templateId: TEMPLATE_ID_PROD_BUG,
    urlSlug: WORKITEM_TYPE_KEY_PROD_BUG,
  });

  workflowLogger.info({ count: mappings.length, mappings }, "PARSE_ISSUE_TYPE_MAPPINGS legacy_env_config");
  return mappings;
}

// ==================== Types ====================

interface WorkitemMapping {
  workitemTypeKey: string;
  templateId: string;
  urlSlug: string;
  fieldMappings?: FieldMappingConfig[];
}

interface WorkflowSourceContext {
  larkBaseRecordUrl?: string;
  larkSharedRecordUrl?: string;
}

export interface LarkBaseWorkflowResult {
  ok: true;
  workitemId: string;
  meegleLink: string;
  recordId: string;
  workitems: Array<{ workitemId: string; meegleLink: string }>;
}

export interface LarkBaseWorkflowError {
  ok: false;
  error: {
    errorCode: MeegleApplyErrorCode | "INVALID_REQUEST" | "LARK_API_ERROR" | "UNKNOWN_ISSUE_TYPE" | "UPDATE_FAILED";
    errorMessage: string;
  };
}

export interface LarkBaseWorkflowDeps extends AuthenticatedLarkClientFactoryDeps {
  executeMeegleApply?: typeof executeMeegleApply;
  updateLarkBaseMeegleLink?: typeof updateLarkBaseMeegleLink;
  getLarkRecordUrl?: typeof getLarkRecordUrl;
}

// ==================== Issue Type Mapping ====================

function resolveWorkitemMappings(
  issueTypes: string[],
  config?: LarkBaseWorkflowConfig,
): WorkitemMapping[] {
  const types = issueTypes.length > 0 ? issueTypes : [DEFAULT_ISSUE_TYPE_FALLBACK];
  const configs = config?.issueTypeMappings ?? parseIssueTypeMappings();
  const seen = new Set<string>();
  const mappings: WorkitemMapping[] = [];

  workflowLogger.info({ issueTypes, fallback: DEFAULT_ISSUE_TYPE_FALLBACK, typesToMatch: types, configCount: configs.length, hasFileConfig: Boolean(config) }, "RESOLVE_WORKITEM_MAPPINGS input");

  for (const c of configs) {
    const hasMatch = types.some((t) => c.larkLabels.includes(t));
    workflowLogger.info({ larkLabels: c.larkLabels, workitemTypeKey: c.workitemTypeKey, hasMatch }, "RESOLVE_WORKITEM_MAPPINGS checking_config");
    if (hasMatch) {
      const key = `${c.workitemTypeKey}|${c.templateId}`;
      if (!seen.has(key)) {
        seen.add(key);
        mappings.push({
          workitemTypeKey: c.workitemTypeKey,
          templateId: c.templateId,
          urlSlug: c.urlSlug || c.workitemTypeKey,
          fieldMappings: (c as WorkitemMapping & { fieldMappings?: FieldMappingConfig[] }).fieldMappings,
        });
      }
    }
  }

  workflowLogger.info({ matchedCount: mappings.length, mappings }, "RESOLVE_WORKITEM_MAPPINGS result");

  if (mappings.length > 0) {
    return mappings;
  }

  throw new Error(`Unknown or unsupported Issue 类型: ${issueTypes.join(", ") || "(empty)"}`);
}

function extractIssueTypes(fields: Record<string, unknown>): string[] {
  const raw = fields["Issue 类型"] ?? fields["fldSQ1D6LG"];
  workflowLogger.info({ rawIssueType: raw }, "EXTRACT_ISSUE_TYPES raw");
  if (!Array.isArray(raw)) {
    workflowLogger.info({}, "EXTRACT_ISSUE_TYPES empty_not_array");
    return [];
  }
  const extracted = raw
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        return String((item as Record<string, unknown>).text ?? (item as Record<string, unknown>).name ?? "");
      }
      return "";
    })
    .filter(Boolean);
  workflowLogger.info({ extracted }, "EXTRACT_ISSUE_TYPES result");
  return extracted;
}

// ==================== Record Parsing ====================

function extractRecordTitle(record: LarkBitableRecord): string {
  const fields = record.fields;
  const desc = String(fields["Issue Description"] ?? fields["fldaAzcMtg"] ?? "");
  if (desc) return desc.split("\n")[0].slice(0, 200);
  const details = String(fields["Details Description"] ?? fields["fldML66Cx1"] ?? "");
  if (details) return details.split("\n")[0].slice(0, 200);
  return `Lark Base Record ${record.record_id}`;
}

function extractRecordDescription(record: LarkBitableRecord): string {
  const fields = record.fields;
  return String(
    fields["Details Description"] ??
      fields["fldML66Cx1"] ??
      fields["Issue Description"] ??
      fields["fldaAzcMtg"] ??
      "",
  );
}

function extractLarkMessageLink(record: LarkBitableRecord): string | undefined {
  // 1. Try common Lark field names that may hold a message link
  const possibleFieldNames = [
    "Lark Message Link",
    "Message Link",
    "Thread Link",
    "Chat Link",
    "lark_message_link",
  ];
  for (const name of possibleFieldNames) {
    const raw = record.fields[name];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = stringifyLarkValue(raw);
    if (value && /(?:threadid|chatid|messageid)=/i.test(value)) {
      return extractCleanUrl(value) ?? value;
    }
  }

  // 2. Fallback: search description text for a message-like URL
  return extractDescriptionRegexValue(record, LARK_MESSAGE_LINK_PATTERN, "i");
}

// ==================== Lark Auth & Record Load ====================

async function loadLarkRecord(
  baseId: string,
  tableId: string,
  recordId: string,
  masterUserId: string,
  deps: LarkBaseWorkflowDeps,
): Promise<{ record: LarkBitableRecord; baseUrl: string }> {
  const { client, baseUrl } = await buildAuthenticatedLarkClient(
    masterUserId,
    "https://open.larksuite.com",
    deps,
  );
  const record = await client.getRecord(baseId, tableId, recordId);
  return { record, baseUrl };
}

// ==================== Lark Base URL Builder ====================

function buildLarkBaseRecordUrl(
  apiBaseUrl: string,
  baseId: string,
  tableId: string,
  recordId: string,
): string {
  const domain = apiBaseUrl.includes("feishu")
    ? "base.feishu.cn"
    : "base.larksuite.com";
  return `https://${domain}/base/${baseId}/table/${tableId}/record/${recordId}`;
}

// ==================== Generic Field Extractor ====================

function extractRawLarkValue(
  fields: Record<string, unknown>,
  fieldNames: string[],
): unknown {
  for (const name of fieldNames) {
    const value = fields[name];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function stringifyLarkValue(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    const texts = raw
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return String((item as Record<string, unknown>).text ?? (item as Record<string, unknown>).name ?? "");
        }
        return "";
      })
      .filter(Boolean);
    return texts.join(", ");
  }
  if (raw && typeof raw === "object") {
    return String((raw as Record<string, unknown>).text ?? (raw as Record<string, unknown>).name ?? "");
  }
  return "";
}

function applyTransform(value: string, transform: FieldMappingConfig["transform"], options?: Record<string, string>): string {
  switch (transform) {
    case "first_line":
      return value.split("\n")[0].slice(0, 200);
    case "select":
      if (options && value in options) {
        return options[value];
      }
      return value;
    case "text":
    default:
      return value;
  }
}

function extractMappedValue(
  record: LarkBitableRecord,
  mapping: FieldMappingConfig,
  sourceContext: WorkflowSourceContext,
): string {
  const sources = getFieldMappingSources(mapping);

  for (const source of sources) {
    const resolved = resolveFieldMappingSource(record, source, sourceContext);
    if (resolved) {
      return applyTransform(resolved, mapping.transform ?? "text", mapping.options);
    }
  }

  return applyTransform("", mapping.transform ?? "text", mapping.options);
}

function getFieldMappingSources(mapping: FieldMappingConfig): FieldMappingSourceConfig[] {
  const sources: FieldMappingSourceConfig[] = [];

  if (mapping.source) {
    sources.push(mapping.source);
  } else if (mapping.larkField) {
    sources.push({
      sourceType: "field",
      sourceField: mapping.larkField,
    });
  }

  if (mapping.fallbackLarkFields) {
    for (const fieldName of mapping.fallbackLarkFields) {
      sources.push({
        sourceType: "field",
        sourceField: fieldName,
      });
    }
  }

  if (mapping.fallbackSources) {
    sources.push(...mapping.fallbackSources);
  }

  return sources;
}

function resolveFieldMappingSource(
  record: LarkBitableRecord,
  source: FieldMappingSourceConfig,
  sourceContext: WorkflowSourceContext,
): string {
  switch (source.sourceType) {
    case "field": {
      const raw = extractRawLarkValue(record.fields, [source.sourceField]);
      return stringifyLarkValue(raw);
    }
    case "record_url":
      return sourceContext.larkBaseRecordUrl || "";
    case "shared_record_url":
      return sourceContext.larkSharedRecordUrl || "";
    case "description_regex":
      return extractDescriptionRegexValue(record, source.pattern, source.flags) || "";
  }
}

function mappingUsesSourceType(
  mapping: WorkitemMapping,
  sourceType: FieldMappingSourceConfig["sourceType"],
): boolean {
  return (mapping.fieldMappings || []).some((fieldMapping) =>
    getFieldMappingSources(fieldMapping).some((source) => source.sourceType === sourceType),
  );
}

function extractDescriptionRegexValue(
  record: LarkBitableRecord,
  pattern: string,
  flags?: string,
): string | undefined {
  try {
    const description = extractRecordDescription(record);
    const regex = new RegExp(pattern, flags);
    const match = description.match(regex);
    return match?.[0] ? extractCleanUrl(match[0]) ?? match[0] : undefined;
  } catch (error) {
    workflowLogger.warn({
      pattern,
      flags,
      message: error instanceof Error ? error.message : String(error),
    }, "INVALID_DESCRIPTION_REGEX");
    return undefined;
  }
}

function extractCleanUrl(value: string): string | undefined {
  const markdownHref = value.match(MARKDOWN_LINK_HREF_PATTERN);
  if (markdownHref?.[1]) {
    return markdownHref[1];
  }

  const directUrl = value.match(URL_IN_TEXT_PATTERN);
  return directUrl?.[0];
}

// ==================== Draft Builder ====================

function buildExecutionDraft(
  record: LarkBitableRecord,
  projectKey: string,
  mapping: WorkitemMapping,
  sourceContext: WorkflowSourceContext,
  index = 0,
): ExecutionDraft {
  let title: string;
  let fieldValuePairs: ExecutionDraft["fieldValuePairs"];

  if (mapping.fieldMappings && mapping.fieldMappings.length > 0) {
    // Config-driven path
    const titleMapping = mapping.fieldMappings.find((m) => m.meegleField === "__title__");
    title = titleMapping
      ? extractMappedValue(record, titleMapping, sourceContext)
      : extractRecordTitle(record);

    // Build description prefix from fields marked with prefix=true targeting description
    const descriptionPrefixMappings = mapping.fieldMappings.filter(
      (m) => m.prefix && m.meegleField === "description",
    );
    const descriptionPrefix = descriptionPrefixMappings
      .map((m) => extractMappedValue(record, m, sourceContext))
      .filter(Boolean)
      .join("\n");

    fieldValuePairs = mapping.fieldMappings
      .filter((m) => m.meegleField !== "__title__" && !m.prefix)
      .map((m) => {
        let value = extractMappedValue(record, m, sourceContext);
        if (m.meegleField === "description") {
          if (descriptionPrefix) {
            value = value ? `${descriptionPrefix}\n\n${value}` : descriptionPrefix;
          }
          if (sourceContext.larkBaseRecordUrl) {
            value = value ? `${value}\n\nLark Base: ${sourceContext.larkBaseRecordUrl}` : `Lark Base: ${sourceContext.larkBaseRecordUrl}`;
          }
        }
        return {
          fieldKey: m.meegleField,
          fieldValue: value,
        };
      });

    // Ensure at least one fieldValuePair (schema requires it)
    if (fieldValuePairs.length === 0) {
      fieldValuePairs = [
        {
          fieldKey: "description",
          fieldValue: title,
        },
      ];
    }
  } else {
    // Legacy hardcoded path
    const description = extractRecordDescription(record);
    title = extractRecordTitle(record);

    const fullDescription = sourceContext.larkBaseRecordUrl
      ? `${description || title}\n\nLark Base: ${sourceContext.larkBaseRecordUrl}`
      : (description || title);

    fieldValuePairs = [
      {
        fieldKey: "description",
        fieldValue: fullDescription,
      },
    ];
  }

  // Auto-populate Lark link custom fields if not already provided by field mappings
  if (sourceContext.larkBaseRecordUrl && !fieldValuePairs.some((p) => p.fieldKey === FIELD_LARK_RECORD_LINK)) {
    fieldValuePairs.push({
      fieldKey: FIELD_LARK_RECORD_LINK,
      fieldValue: sourceContext.larkBaseRecordUrl,
    });
  }
  const larkMessageLink = extractLarkMessageLink(record);
  if (larkMessageLink && !fieldValuePairs.some((p) => p.fieldKey === FIELD_LARK_MESSAGE_LINK)) {
    fieldValuePairs.push({
      fieldKey: FIELD_LARK_MESSAGE_LINK,
      fieldValue: larkMessageLink,
    });
  }

  const draft: ExecutionDraft = {
    draftId: `draft_base_${record.record_id}_${mapping.workitemTypeKey}_${index}`,
    sourceRef: {
      sourcePlatform: "lark_base",
      sourceRecordId: record.record_id,
    },
    target: {
      projectKey,
      workitemTypeKey: mapping.workitemTypeKey,
      templateId: mapping.templateId,
    },
    name: title || `Lark Base Record ${record.record_id}`,
    needConfirm: true,
    fieldValuePairs,
    ownerUserKeys: [],
    missingMeta: [],
  };

  workflowLogger.info({
    draftId: draft.draftId,
    workitemTypeKey: mapping.workitemTypeKey,
    templateId: mapping.templateId,
    title: draft.name,
    hasRecordLink: !!sourceContext.larkBaseRecordUrl,
    hasSharedRecordLink: !!sourceContext.larkSharedRecordUrl,
    hasMessageLink: !!larkMessageLink,
  }, "BUILD_EXECUTION_DRAFT");
  return draft;
}

function buildMeegleUrl(
  workitemId: string,
  projectKey: string,
  urlSlug: string,
): string {
  const base = MEEGLE_BASE_URL.replace(/\/$/, "");
  return `${base}/${projectKey}/${urlSlug}/detail/${workitemId}`;
}

// ==================== Orchestrator ====================

export async function executeLarkBaseWorkflow(
  request: CreateLarkBaseWorkflowRequest,
  deps: LarkBaseWorkflowDeps = {},
): Promise<LarkBaseWorkflowResult | LarkBaseWorkflowError> {
  const baseId = request.baseId || DEFAULT_BASE_ID;
  const tableId = request.tableId || DEFAULT_TABLE_ID;
  const projectKey = request.projectKey || DEFAULT_PROJECT_KEY;

  if (!baseId || !tableId) {
    return {
      ok: false,
      error: {
        errorCode: "INVALID_REQUEST",
        errorMessage: "baseId and tableId are required (or must be configured via environment variables)",
      },
    };
  }

  const config = loadLarkBaseWorkflowConfig();

  let record: LarkBitableRecord;
  let larkApiBaseUrl: string | undefined;
  try {
    const loaded = await loadLarkRecord(baseId, tableId, request.recordId, request.masterUserId, deps);
    record = loaded.record;
    larkApiBaseUrl = loaded.baseUrl;
    workflowLogger.info({
      recordId: record.record_id,
      fieldKeys: Object.keys(record.fields),
      issueTypeRaw: record.fields["Issue 类型"] ?? record.fields["fldSQ1D6LG"],
    }, "RECORD_LOADED");
  } catch (error) {
    const larkErrorResponse =
      error && typeof error === "object" && "response" in error
        ? (error as { response?: Record<string, unknown> }).response
        : undefined;
    const larkErrorStatusCode =
      error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
    workflowLogger.error({
      baseId,
      tableId,
      recordId: request.recordId,
      masterUserId: request.masterUserId,
      statusCode: larkErrorStatusCode,
      message: error instanceof Error ? error.message : String(error),
      larkErrorResponse,
    }, "LARK_API_ERROR");
    return {
      ok: false,
      error: {
        errorCode: "LARK_API_ERROR",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const issueTypes = extractIssueTypes(record.fields);
  let mappings: WorkitemMapping[];
  try {
    mappings = resolveWorkitemMappings(issueTypes, config ?? undefined);
  } catch (error) {
    return {
      ok: false,
      error: {
        errorCode: "UNKNOWN_ISSUE_TYPE",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const sourceContext: WorkflowSourceContext = {
    larkBaseRecordUrl: larkApiBaseUrl
      ? buildLarkBaseRecordUrl(larkApiBaseUrl, baseId, tableId, request.recordId)
      : undefined,
  };

  if (mappings.some((mapping) => mappingUsesSourceType(mapping, "shared_record_url"))) {
    try {
      const sharedRecord = await (deps.getLarkRecordUrl ?? getLarkRecordUrl)(
        {
          baseId,
          tableId,
          recordId: request.recordId,
          masterUserId: request.masterUserId,
        },
        deps,
      );
      sourceContext.larkSharedRecordUrl = sharedRecord.recordUrl;
    } catch (error) {
      return {
        ok: false,
        error: {
          errorCode: "LARK_API_ERROR",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  const workitems: Array<{ workitemId: string; meegleLink: string }> = [];

  workflowLogger.info({ mappingCount: mappings.length }, "STARTING_WORKITEM_CREATION_LOOP");

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const draft = buildExecutionDraft(record, projectKey, mapping, sourceContext, i);

    workflowLogger.info({ index: i, workitemTypeKey: mapping.workitemTypeKey, templateId: mapping.templateId, idempotencyKey: `idem_base_${request.recordId}_${mapping.workitemTypeKey}_${i}` }, "APPLYING_MAPPING");

    let workitemId: string;
    try {
      const applyResult = await (deps.executeMeegleApply ?? executeMeegleApply)(
        {
          requestId: `req_base_${request.recordId}_${i}`,
          draft,
          operatorLarkId: "ou_system",
          masterUserId: request.masterUserId,
          idempotencyKey: `idem_base_${request.recordId}_${mapping.workitemTypeKey}_${i}`,
        },
        {},
      );
      workitemId = applyResult.workitemId;
      workflowLogger.info({ index: i, workitemId }, "WORKITEM_CREATED");
    } catch (error) {
      const errorCode =
        error && typeof error === "object" && "errorCode" in error
          ? (error as { errorCode: MeegleApplyErrorCode }).errorCode
          : "UPDATE_FAILED";
      const statusCode = error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
      const response = error && typeof error === "object" && "response" in error
        ? (error as { response?: Record<string, unknown> }).response
        : undefined;

      workflowLogger.error({
        index: i,
        workitemTypeKey: mapping.workitemTypeKey,
        errorCode,
        statusCode,
        response,
        message: error instanceof Error ? error.message : String(error),
      }, "WORKITEM_CREATION_FAILED");

      return {
        ok: false,
        error: {
          errorCode,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      };
    }

    const meegleLink = buildMeegleUrl(workitemId, projectKey, mapping.urlSlug);
    workitems.push({ workitemId, meegleLink });
  }

  const meegleLinks = workitems.map((w) => w.meegleLink).join("\n");
  workflowLogger.info({ recordId: request.recordId, meegleLinks }, "WRITING_MEEGLE_LINK_BACK");

  try {
    await (deps.updateLarkBaseMeegleLink ?? updateLarkBaseMeegleLink)({
      baseId,
      tableId,
      recordId: request.recordId,
      meegleLink: meegleLinks,
      masterUserId: request.masterUserId,
    });
  } catch (error) {
    const statusCode = error && typeof error === "object" && "statusCode" in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;
    const response = error && typeof error === "object" && "response" in error
      ? (error as { response?: Record<string, unknown> }).response
      : undefined;

    workflowLogger.error({
      recordId: request.recordId,
      statusCode,
      response,
      message: error instanceof Error ? error.message : String(error),
    }, "WRITE_BACK_TO_LARK_FAILED");

    return {
      ok: false,
      error: {
        errorCode: "UPDATE_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const primaryWorkitemId = workitems[0]?.workitemId ?? "";
  workflowLogger.info({ recordId: request.recordId, workitemCount: workitems.length, primaryWorkitemId }, "WORKFLOW_COMPLETED");
  return {
    ok: true,
    workitemId: primaryWorkitemId,
    meegleLink: workitems[0]?.meegleLink ?? "",
    recordId: request.recordId,
    workitems,
  };
}
