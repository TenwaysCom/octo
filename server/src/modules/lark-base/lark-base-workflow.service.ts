import { LarkClient, type LarkBitableRecord } from "../../adapters/lark/lark-client.js";
import { getSharedLarkTokenStore } from "../../adapters/postgres/lark-token-store.js";
import type { LarkTokenStore } from "../../adapters/lark/token-store.js";
import { refreshLarkToken } from "../lark-auth/lark-auth.service.js";
import { executeMeegleApply, type MeegleApplyErrorCode } from "../../application/services/meegle-apply.service.js";
import { updateLarkBaseMeegleLink } from "./lark-base.service.js";
import type { CreateLarkBaseWorkflowRequest } from "./lark-base-workflow.dto.js";
import type { ExecutionDraft } from "../../validators/agent-output/execution-draft.js";

// ==================== Environment Defaults ====================

const DEFAULT_BASE_ID = process.env.LARK_BASE_DEFAULT_BASE_ID || "";
const DEFAULT_TABLE_ID = process.env.LARK_BASE_DEFAULT_TABLE_ID || "";
const DEFAULT_PROJECT_KEY = process.env.MEEGLE_PROJECT_KEY || "4c3fv6";
const MEEGLE_WORKITEM_URL_BASE = process.env.MEEGLE_WORKITEM_URL_BASE || "https://meego.feishu.cn";

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

interface IssueTypeMappingConfig {
  larkLabels: string[];
  workitemTypeKey: string;
  templateId: string;
}

function parseIssueTypeMappings(): IssueTypeMappingConfig[] {
  const raw = process.env.LARK_BASE_ISSUE_TYPE_MAPPINGS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as IssueTypeMappingConfig[];
      if (Array.isArray(parsed)) {
        console.log("[LarkBaseWorkflow] parseIssueTypeMappings: using JSON config", { count: parsed.length, parsed });
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
    },
  ];

  if (WORKITEM_TYPE_KEY_TECH_TASK) {
    mappings.push({
      larkLabels: [ISSUE_TYPE_TECH_TASK],
      workitemTypeKey: WORKITEM_TYPE_KEY_TECH_TASK,
      templateId: TEMPLATE_ID_TECH_TASK,
    });
  }

  mappings.push({
    larkLabels: [ISSUE_TYPE_PROD_BUG],
    workitemTypeKey: WORKITEM_TYPE_KEY_PROD_BUG,
    templateId: TEMPLATE_ID_PROD_BUG,
  });

  console.log("[LarkBaseWorkflow] parseIssueTypeMappings: using legacy env config", { count: mappings.length, mappings });
  return mappings;
}

// ==================== Types ====================

interface WorkitemMapping {
  workitemTypeKey: string;
  templateId: string;
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

export interface LarkBaseWorkflowDeps {
  getLarkTokenStore?: () => LarkTokenStore;
  refreshLarkToken?: typeof refreshLarkToken;
  createLarkClient?: (accessToken: string, baseUrl?: string) => LarkClient;
  executeMeegleApply?: typeof executeMeegleApply;
  updateLarkBaseMeegleLink?: typeof updateLarkBaseMeegleLink;
}

// ==================== Issue Type Mapping ====================

function resolveWorkitemMappings(issueTypes: string[]): WorkitemMapping[] {
  const types = issueTypes.length > 0 ? issueTypes : [DEFAULT_ISSUE_TYPE_FALLBACK];
  const configs = parseIssueTypeMappings();
  const seen = new Set<string>();
  const mappings: WorkitemMapping[] = [];

  console.log("[LarkBaseWorkflow] resolveWorkitemMappings input", { issueTypes, fallback: DEFAULT_ISSUE_TYPE_FALLBACK, typesToMatch: types, configCount: configs.length });

  for (const config of configs) {
    const hasMatch = types.some((t) => config.larkLabels.includes(t));
    console.log("[LarkBaseWorkflow] resolveWorkitemMappings checking config", { larkLabels: config.larkLabels, workitemTypeKey: config.workitemTypeKey, hasMatch });
    if (hasMatch) {
      const key = `${config.workitemTypeKey}|${config.templateId}`;
      if (!seen.has(key)) {
        seen.add(key);
        mappings.push({
          workitemTypeKey: config.workitemTypeKey,
          templateId: config.templateId,
        });
      }
    }
  }

  console.log("[LarkBaseWorkflow] resolveWorkitemMappings result", { matchedCount: mappings.length, mappings });

  if (mappings.length > 0) {
    return mappings;
  }

  throw new Error(`Unknown or unsupported Issue 类型: ${issueTypes.join(", ") || "(empty)"}`);
}

function extractIssueTypes(fields: Record<string, unknown>): string[] {
  const raw = fields["Issue 类型"] ?? fields["fldSQ1D6LG"];
  console.log("[LarkBaseWorkflow] extractIssueTypes raw", { rawIssueType: raw });
  if (!Array.isArray(raw)) {
    console.log("[LarkBaseWorkflow] extractIssueTypes result: empty (not an array)");
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
  console.log("[LarkBaseWorkflow] extractIssueTypes result", { extracted });
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
    fields["Issue Description"] ??
      fields["fldaAzcMtg"] ??
      fields["Details Description"] ??
      fields["fldML66Cx1"] ??
      "",
  );
}

// ==================== Lark Auth & Record Load ====================

async function getLarkAccessToken(
  masterUserId: string,
  deps: LarkBaseWorkflowDeps,
): Promise<{ accessToken: string; baseUrl: string }> {
  const tokenStore = deps.getLarkTokenStore?.() ?? getSharedLarkTokenStore();
  const stored = await tokenStore.get({
    masterUserId,
    baseUrl: "https://open.larksuite.com",
  });

  if (!stored) {
    throw new Error("Lark token not found for user");
  }

  let accessToken = stored.userToken;
  const expiresAt = stored.userTokenExpiresAt ? Date.parse(stored.userTokenExpiresAt) : 0;
  const isExpired = !expiresAt || expiresAt <= Date.now() + 60_000;

  if (isExpired && stored.refreshToken) {
    const refreshed = await (deps.refreshLarkToken ?? refreshLarkToken)({
      masterUserId,
      baseUrl: stored.baseUrl,
      refreshToken: stored.refreshToken,
    });
    accessToken = refreshed.accessToken;
  }

  return { accessToken, baseUrl: stored.baseUrl };
}

async function loadLarkRecord(
  baseId: string,
  tableId: string,
  recordId: string,
  masterUserId: string,
  deps: LarkBaseWorkflowDeps,
): Promise<LarkBitableRecord> {
  const { accessToken, baseUrl } = await getLarkAccessToken(masterUserId, deps);
  const client = deps.createLarkClient
    ? deps.createLarkClient(accessToken, baseUrl)
    : new LarkClient({ accessToken, baseUrl });
  return client.getRecord(baseId, tableId, recordId);
}

// ==================== Draft Builder ====================

function buildExecutionDraft(
  record: LarkBitableRecord,
  projectKey: string,
  mapping: WorkitemMapping,
  index = 0,
): ExecutionDraft {
  const title = extractRecordTitle(record);
  const description = extractRecordDescription(record);

  const fieldValuePairs: ExecutionDraft["fieldValuePairs"] = [
    {
      fieldKey: "description",
      fieldValue: description || title,
    },
  ];

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
    name: title,
    needConfirm: true,
    fieldValuePairs,
    ownerUserKeys: [],
    missingMeta: [],
  };

  console.log("[LarkBaseWorkflow] buildExecutionDraft", { draftId: draft.draftId, workitemTypeKey: mapping.workitemTypeKey, templateId: mapping.templateId, title });
  return draft;
}

function buildMeegleUrl(workitemId: string): string {
  const base = MEEGLE_WORKITEM_URL_BASE.replace(/\/$/, "");
  return `${base}/issue/${workitemId}`;
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

  let record: LarkBitableRecord;
  try {
    record = await loadLarkRecord(baseId, tableId, request.recordId, request.masterUserId, deps);
    console.log("[LarkBaseWorkflow] Record loaded", {
      recordId: record.record_id,
      fieldKeys: Object.keys(record.fields),
      issueTypeRaw: record.fields["Issue 类型"] ?? record.fields["fldSQ1D6LG"],
    });
  } catch (error) {
    const larkErrorResponse =
      error && typeof error === "object" && "response" in error
        ? (error as { response?: Record<string, unknown> }).response
        : undefined;
    const larkErrorStatusCode =
      error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
    console.error("[LarkBaseWorkflow] Lark API error:", {
      baseId,
      tableId,
      recordId: request.recordId,
      masterUserId: request.masterUserId,
      statusCode: larkErrorStatusCode,
      message: error instanceof Error ? error.message : String(error),
      larkErrorResponse,
      rawError: error,
    });
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
    mappings = resolveWorkitemMappings(issueTypes);
  } catch (error) {
    return {
      ok: false,
      error: {
        errorCode: "UNKNOWN_ISSUE_TYPE",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const workitems: Array<{ workitemId: string; meegleLink: string }> = [];

  console.log("[LarkBaseWorkflow] Starting workitem creation loop", { mappingCount: mappings.length });

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const draft = buildExecutionDraft(record, projectKey, mapping, i);

    console.log("[LarkBaseWorkflow] Applying mapping", { index: i, workitemTypeKey: mapping.workitemTypeKey, templateId: mapping.templateId, idempotencyKey: `idem_base_${request.recordId}_${mapping.workitemTypeKey}_${i}` });

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
      console.log("[LarkBaseWorkflow] Workitem created", { index: i, workitemId });
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

      console.error("[LarkBaseWorkflow] Workitem creation failed", {
        index: i,
        workitemTypeKey: mapping.workitemTypeKey,
        errorCode,
        statusCode,
        response,
        message: error instanceof Error ? error.message : String(error),
      });

      return {
        ok: false,
        error: {
          errorCode,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      };
    }

    const meegleLink = buildMeegleUrl(workitemId);
    workitems.push({ workitemId, meegleLink });
  }

  const meegleLinks = workitems.map((w) => w.meegleLink).join("\n");

  try {
    await (deps.updateLarkBaseMeegleLink ?? updateLarkBaseMeegleLink)({
      baseId,
      tableId,
      recordId: request.recordId,
      meegleLink: meegleLinks,
      masterUserId: request.masterUserId,
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        errorCode: "UPDATE_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const result = {
    ok: true,
    workitemId: workitems[0]?.workitemId ?? "",
    meegleLink: workitems[0]?.meegleLink ?? "",
    recordId: request.recordId,
    workitems,
  };
  console.log("[LarkBaseWorkflow] Workflow completed successfully", { recordId: request.recordId, workitemCount: workitems.length, primaryWorkitemId: result.workitemId });
  return result;
}
