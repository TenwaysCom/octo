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

// ==================== Types ====================

interface WorkitemMapping {
  draftType: "b1" | "b2";
  workitemTypeKey: string;
  templateId: string;
}

export interface LarkBaseWorkflowResult {
  ok: true;
  workitemId: string;
  meegleLink: string;
  recordId: string;
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

function getWorkitemMapping(issueTypes: string[]): WorkitemMapping {
  if (issueTypes.includes(ISSUE_TYPE_STORY)) {
    return { draftType: "b1", workitemTypeKey: WORKITEM_TYPE_KEY_STORY, templateId: TEMPLATE_ID_STORY };
  }
  if (issueTypes.includes(ISSUE_TYPE_TECH_TASK) && WORKITEM_TYPE_KEY_TECH_TASK) {
    return { draftType: "b1", workitemTypeKey: WORKITEM_TYPE_KEY_TECH_TASK, templateId: TEMPLATE_ID_TECH_TASK };
  }
  if (issueTypes.includes(ISSUE_TYPE_PROD_BUG)) {
    return { draftType: "b2", workitemTypeKey: WORKITEM_TYPE_KEY_PROD_BUG, templateId: TEMPLATE_ID_PROD_BUG };
  }
  throw new Error(`Unknown or unsupported Issue 类型: ${issueTypes.join(", ") || "(empty)"}`);
}

function extractIssueTypes(fields: Record<string, unknown>): string[] {
  const raw = fields["Issue 类型"] ?? fields["fldSQ1D6LG"];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        return String((item as Record<string, unknown>).text ?? (item as Record<string, unknown>).name ?? "");
      }
      return "";
    })
    .filter(Boolean);
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
): ExecutionDraft {
  const title = extractRecordTitle(record);
  const description = extractRecordDescription(record);

  const fieldValuePairs: ExecutionDraft["fieldValuePairs"] = [
    {
      fieldKey: "description",
      fieldValue: description || title,
    },
  ];

  return {
    draftId: `draft_base_${record.record_id}`,
    draftType: mapping.draftType,
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
  } catch (error) {
    return {
      ok: false,
      error: {
        errorCode: "LARK_API_ERROR",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const issueTypes = extractIssueTypes(record.fields);
  let mapping: WorkitemMapping;
  try {
    mapping = getWorkitemMapping(issueTypes);
  } catch (error) {
    return {
      ok: false,
      error: {
        errorCode: "UNKNOWN_ISSUE_TYPE",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const draft = buildExecutionDraft(record, projectKey, mapping);

  let workitemId: string;
  try {
    const applyResult = await (deps.executeMeegleApply ?? executeMeegleApply)(
      {
        requestId: `req_base_${request.recordId}`,
        draft,
        operatorLarkId: "ou_system",
        masterUserId: request.masterUserId,
        idempotencyKey: `idem_base_${request.recordId}`,
      },
      {},
    );
    workitemId = applyResult.workitemId;
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "errorCode" in error
        ? (error as { errorCode: MeegleApplyErrorCode }).errorCode
        : "UPDATE_FAILED";
    return {
      ok: false,
      error: {
        errorCode,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const meegleLink = buildMeegleUrl(workitemId);

  try {
    await (deps.updateLarkBaseMeegleLink ?? updateLarkBaseMeegleLink)({
      baseId,
      tableId,
      recordId: request.recordId,
      meegleLink,
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

  return {
    ok: true,
    workitemId,
    meegleLink,
    recordId: request.recordId,
  };
}
