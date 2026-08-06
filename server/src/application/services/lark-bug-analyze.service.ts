import type { AcpKimiProxyService } from "./acp-kimi-proxy.service.js";
import { acpKimiProxyService } from "./acp-kimi-proxy.service.js";
import {
  createMeegleClient,
  type MeegleClientFactoryDeps,
} from "./meegle-client.factory.js";
import {
  buildAuthenticatedLarkClient,
  type AuthenticatedLarkClientFactoryDeps,
} from "./lark-auth-client.factory.js";
import {
  refreshCredential as refreshMeegleCredential,
  type CredentialStatus,
  type MeegleCredentialServiceDeps,
} from "./meegle-credential.service.js";
import { resolveMeegleProductionBugFieldKey } from "./meegle-production-bug-field-config.js";
import type { MeegleClient } from "../../adapters/meegle/meegle-client.js";
import type { LarkBitableRecord } from "../../adapters/lark/lark-client.js";
import { KimiAcpRuntimeError } from "../../adapters/kimi-acp/kimi-acp-runtime.js";
import {
  getResolvedUserStore,
  type ResolvedUserStore,
} from "../../adapters/postgres/resolved-user-store.js";
import {
  getWorkflowPromptStore,
  type WorkflowPromptStore,
} from "../../adapters/postgres/workflow-prompt-store.js";
import {
  DEFAULT_LARK_BUG_ANALYZE_PROMPT_TEMPLATE,
  LARK_BUG_ANALYZE_PROMPT_KEY,
  renderWorkflowPromptTemplate,
} from "../../domain/workflow-prompts.js";
import { getConfiguredMeegleAuthServiceDeps } from "../../modules/meegle-auth/meegle-auth.service.js";
import type { LarkBugAnalyzeControllerRequest } from "../../modules/lark-bug/lark-bug-analyze.dto.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import { logger } from "../../logger.js";

const bugLogger = logger.child({ module: "lark-bug-analyze" });

const PRODUCTION_BUG_API_NAME = "production_bug";
const PRODUCTION_BUG_TYPE_KEY = "6932e40429d1cd8aac635c82";
const DEFAULT_BUG_ACP_TIMEOUT_MS = 110_000;
const DEFAULT_BUG_ACP_CONCURRENCY_LIMIT = 3;
const LARK_THREAD_CONTEXT_MESSAGE_LIMIT = 50;
const DEFAULT_LARK_BASE_ID = process.env.LARK_BASE_DEFAULT_BASE_ID || "";
const DEFAULT_LARK_TABLE_ID = process.env.LARK_BASE_DEFAULT_TABLE_ID || "";

export interface BugAcpLimiter {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export interface LarkBugAnalyzeResult {
  ok: true;
  data: {
    workItemId: string;
    workItemTypeKey: string;
    updatedField?: "analysisSummary" | "Details Description";
    actionRunId?: string;
    analysisSummary: string;
  };
}

export interface LarkBugAnalyzeErrorResponse {
  ok: false;
  error: {
    layer: "server" | "adapter" | "platform";
    module: "lark-bug-analyze";
    stage: string;
    errorCode: string;
    errorMessage: string;
    actionRunId?: string;
  };
}

export interface LarkBugAnalyzeDeps
  extends MeegleClientFactoryDeps, AuthenticatedLarkClientFactoryDeps {
  resolvedUserStore?: ResolvedUserStore;
  workflowPromptStore?: WorkflowPromptStore;
  acpService?: AcpKimiProxyService;
  acpLimiter?: BugAcpLimiter;
  createMeegleClient?: (
    config: {
      masterUserId: string;
      meegleUserKey: string;
      baseUrl: string;
    },
    deps?: MeegleClientFactoryDeps,
  ) => Promise<MeegleClient>;
  refreshCredential?: (
    input: {
      masterUserId: string;
      meegleUserKey: string;
      baseUrl: string;
    },
    deps?: Partial<MeegleCredentialServiceDeps>,
  ) => Promise<CredentialStatus>;
}

type MeegleProductionBugIds = {
  projectKey: string;
  workItemTypeKey: string;
  workItemId: string;
};

type LarkRecordIds = {
  baseId: string;
  tableId: string;
  recordId: string;
};

type LarkRecordAnalyzeClient = {
  getRecord(baseId: string, tableId: string, recordId: string): Promise<LarkBitableRecord>;
  updateRecord(
    baseId: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<LarkBitableRecord>;
  getMessage?(messageId: string): Promise<{ message_id: string; content?: string }>;
  getThreadMessages?(threadId: string): Promise<{
    items: Array<{ message_id: string; root_id?: string; content?: string }>;
    hasMore: boolean;
    pageToken?: string;
  }>;
};

interface LarkBugContext {
  bugDescription: string;
  larkThreadContext: string;
}

export type LarkBugAnalyzeResponse =
  | LarkBugAnalyzeResult
  | LarkBugAnalyzeErrorResponse;

export async function executeLarkBugAnalyze(
  request: LarkBugAnalyzeControllerRequest,
  deps: LarkBugAnalyzeDeps = {},
): Promise<LarkBugAnalyzeResponse> {
  const actionRunId = request.actionRunId;

  try {
    const larkIds = resolveLarkRecordIds(request);
    if (larkIds) {
      return await executeLarkRecordAnalyze(request, larkIds, deps);
    }
    if ((request.baseId || request.tableId || request.viewId || request.wikiRecordId) && !request.recordId) {
      return toError(
        "server.action.received",
        "LARK_RECORD_ID_REQUIRED",
        "A real Lark Base recordId is required for bug analysis. Open a single Lark Base record detail panel and retry so the extension can read Lark Message Link, Issue Description, and Details Description.",
        actionRunId,
      );
    }

    const ids = resolveProductionBugIds(request);
    if (!isProductionBugType(ids.workItemTypeKey)) {
      return toError(
        "server.workflow.started",
        "MEEGLE_PRODUCTION_BUG_TYPE_UNSUPPORTED",
        `Only production bug workitems are supported, got ${ids.workItemTypeKey}.`,
        actionRunId,
      );
    }

    const userStore = deps.resolvedUserStore ?? getResolvedUserStore();
    const resolvedUser = await userStore.getById(request.masterUserId);
    if (!resolvedUser) {
      return toError(
        "server.identity.resolved",
        "IDENTITY_NOT_FOUND",
        "Master user was not found.",
        actionRunId,
      );
    }

    if (!resolvedUser.meegleUserKey) {
      return toError(
        "server.identity.resolved",
        "MEEGLE_BINDING_REQUIRED",
        "Current user is not bound to a Meegle identity.",
        actionRunId,
      );
    }

    if (!resolvedUser.larkId) {
      return toError(
        "server.identity.resolved",
        "LARK_IDENTITY_REQUIRED",
        "Current user is missing a Lark identity for Kimi ACP.",
        actionRunId,
      );
    }

    const refreshInput = {
      masterUserId: request.masterUserId,
      meegleUserKey: resolvedUser.meegleUserKey,
      baseUrl: request.baseUrl,
    };
    const refreshResult = deps.refreshCredential
      ? await deps.refreshCredential(refreshInput)
      : await refreshDefaultMeegleCredential(refreshInput);

    if (refreshResult.tokenStatus !== "ready" || !refreshResult.userToken) {
      return toError(
        "server.auth.checked",
        "MEEGLE_AUTH_REQUIRED",
        "Meegle authorization is missing or expired.",
        actionRunId,
      );
    }

    const clientFactory = deps.createMeegleClient ?? createMeegleClient;
    const meegleClient = await clientFactory(
      {
        masterUserId: request.masterUserId,
        meegleUserKey: resolvedUser.meegleUserKey,
        baseUrl: request.baseUrl,
      },
      deps,
    );

    const workitemTypeKey = normalizeProductionBugTypeKey(ids.workItemTypeKey);
    const workitems = await meegleClient.getWorkitemDetails(
      ids.projectKey,
      workitemTypeKey,
      [ids.workItemId],
    );
    const workitem = workitems[0];
    if (!workitem) {
      return toError(
        "adapter.meegle.response",
        "MEEGLE_WORKITEM_NOT_FOUND",
        `Workitem ${ids.workItemId} was not found.`,
        actionRunId,
        "adapter",
      );
    }

    const bugFields = summarizeWorkitemFields(workitem.fields);
    if (!workitem.name && !bugFields) {
      return toError(
        "server.workflow.started",
        "MEEGLE_PRODUCTION_BUG_CONTENT_EMPTY",
        "Production Bug content is empty.",
        actionRunId,
      );
    }

    const promptTemplate = await resolveProductionBugAnalyzePromptTemplate(
      deps.workflowPromptStore ?? getWorkflowPromptStore(),
    );
    const analysisSummary = await runProductionBugAnalysis(
      {
        operatorLarkId: resolvedUser.larkId,
        bugTitle: workitem.name,
        bugFields,
        bugDescription: bugFields,
        promptTemplate,
      },
      deps.acpService ?? acpKimiProxyService,
      deps.acpLimiter ?? defaultBugAcpLimiter,
    );

    if (!analysisSummary) {
      return toError(
        "server.workflow.completed",
        "ACP_EMPTY_RESULT",
        "Kimi ACP returned an empty result.",
        actionRunId,
      );
    }

    await meegleClient.updateWorkitem(
      ids.projectKey,
      workitemTypeKey,
      ids.workItemId,
      [
        {
          fieldKey: resolveMeegleProductionBugFieldKey("analysisSummary"),
          fieldValue: analysisSummary,
        },
      ],
    );

    bugLogger.info({
      actionRunId,
      projectKey: ids.projectKey,
      workItemTypeKey: ids.workItemTypeKey,
      workItemId: ids.workItemId,
      stage: "server.workflow.completed",
    }, "LARK_BUG_ANALYZE_OK");

    return {
      ok: true,
      data: {
        workItemId: ids.workItemId,
        workItemTypeKey: ids.workItemTypeKey,
        updatedField: "analysisSummary",
        actionRunId,
        analysisSummary,
      },
    };
  } catch (error) {
    const acpError = normalizeAcpError(error);
    if (acpError) {
      return toError(
        acpError.stage,
        acpError.errorCode,
        acpError.errorMessage,
        actionRunId,
        acpError.layer,
      );
    }

    return toError(
      "server.workflow.completed",
      "LARK_BUG_ANALYZE_FAILED",
      error instanceof Error ? error.message : String(error),
      actionRunId,
    );
  }
}

async function executeLarkRecordAnalyze(
  request: LarkBugAnalyzeControllerRequest,
  ids: LarkRecordIds,
  deps: LarkBugAnalyzeDeps,
): Promise<LarkBugAnalyzeResponse> {
  const actionRunId = request.actionRunId;

  try {
    if (!ids.baseId || !ids.tableId) {
      return toError(
        "server.action.received",
        "INVALID_REQUEST",
        "baseId and tableId are required for Lark record analysis.",
        actionRunId,
      );
    }

    const { client } = await buildAuthenticatedLarkClient(
      request.masterUserId,
      "https://open.larksuite.com",
      deps,
    );
    const larkClient = client as LarkRecordAnalyzeClient;
    const record = await larkClient.getRecord(ids.baseId, ids.tableId, ids.recordId);
    const bugContext = await resolveLarkBugContext(record, larkClient);
    const bugDescription = bugContext.bugDescription;
    const bugFields = summarizeLarkRecord(record);
    if (!bugDescription && !bugFields) {
      return toError(
        "server.workflow.started",
        "LARK_RECORD_CONTENT_EMPTY",
        "Lark record content is empty.",
        actionRunId,
      );
    }

    const promptTemplate = await resolveProductionBugAnalyzePromptTemplate(
      deps.workflowPromptStore ?? getWorkflowPromptStore(),
    );
    const analysisSummary = await runProductionBugAnalysis(
      {
        operatorLarkId: await resolveOperatorLarkId(request.masterUserId, deps.resolvedUserStore),
        bugTitle: getLarkRecordTitle(record),
        bugFields,
        bugDescription: bugDescription || bugFields,
        larkThreadContext: bugContext.larkThreadContext,
        promptTemplate,
      },
      deps.acpService ?? acpKimiProxyService,
      deps.acpLimiter ?? defaultBugAcpLimiter,
    );

    if (!analysisSummary) {
      return toError(
        "server.workflow.completed",
        "ACP_EMPTY_RESULT",
        "Kimi ACP returned an empty result.",
        actionRunId,
      );
    }

    await appendLarkRecordDetailsDescription(
      larkClient,
      ids,
      record,
      analysisSummary,
    );

    bugLogger.info({
      actionRunId,
      baseId: ids.baseId,
      tableId: ids.tableId,
      recordId: ids.recordId,
      stage: "server.workflow.completed",
    }, "LARK_BUG_ANALYZE_OK");

    return {
      ok: true,
      data: {
        workItemId: ids.recordId,
        workItemTypeKey: "lark_record",
        updatedField: "Details Description",
        actionRunId,
        analysisSummary,
      },
    };
  } catch (error) {
    const acpError = normalizeAcpError(error);
    if (acpError) {
      return toError(
        acpError.stage,
        acpError.errorCode,
        acpError.errorMessage,
        actionRunId,
        acpError.layer,
      );
    }

    return toError(
      "server.workflow.completed",
      "LARK_RECORD_BUG_ANALYZE_FAILED",
      error instanceof Error ? error.message : String(error),
      actionRunId,
    );
  }
}

function resolveProductionBugIds(
  request: LarkBugAnalyzeControllerRequest,
): MeegleProductionBugIds {
  if (request.projectKey && request.workItemTypeKey && request.workItemId) {
    return {
      projectKey: request.projectKey,
      workItemTypeKey: request.workItemTypeKey,
      workItemId: request.workItemId,
    };
  }

  if (!request.meegleUrl) {
    throw new Error("Missing Meegle workitem identifiers.");
  }

  const url = new URL(request.meegleUrl);
  const pathParts = url.pathname.split("/").filter(Boolean);
  if (pathParts.length < 4 || pathParts[2] !== "detail") {
    throw new Error(`Invalid Meegle workitem URL: ${request.meegleUrl}`);
  }

  return {
    projectKey: pathParts[0],
    workItemTypeKey: pathParts[1],
    workItemId: pathParts[3],
  };
}

function resolveLarkRecordIds(
  request: LarkBugAnalyzeControllerRequest,
): LarkRecordIds | null {
  if (!request.recordId) {
    return null;
  }

  return {
    baseId: request.baseId || DEFAULT_LARK_BASE_ID,
    tableId: request.tableId || DEFAULT_LARK_TABLE_ID,
    recordId: request.recordId,
  };
}

function isProductionBugType(workItemTypeKey: string): boolean {
  return workItemTypeKey === PRODUCTION_BUG_API_NAME || workItemTypeKey === PRODUCTION_BUG_TYPE_KEY;
}

function normalizeProductionBugTypeKey(workItemTypeKey: string): string {
  return workItemTypeKey === PRODUCTION_BUG_API_NAME
    ? PRODUCTION_BUG_TYPE_KEY
    : workItemTypeKey;
}

function summarizeWorkitemFields(fields: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === "fields") {
      continue;
    }

    const text = extractTextValue(value);
    if (text) {
      lines.push(`${key}: ${text}`);
    }
  }

  const fieldValuePairs = fields.fields;
  if (Array.isArray(fieldValuePairs)) {
    for (const item of fieldValuePairs) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const record = item as Record<string, unknown>;
      const fieldKey = extractTextValue(record.field_alias) ||
        extractTextValue(record.field_name) ||
        extractTextValue(record.field_key);
      const fieldValue = extractTextValue(record.field_value);
      if (fieldKey && fieldValue) {
        lines.push(`${fieldKey}: ${fieldValue}`);
      }
    }
  }

  return lines.join("\n").trim();
}

function summarizeLarkRecord(record: LarkBitableRecord): string {
  const lines: string[] = [`recordId: ${record.record_id}`];
  for (const [key, value] of Object.entries(record.fields)) {
    const text = extractTextValue(value);
    if (text) {
      lines.push(`${key}: ${text}`);
    }
  }

  return lines.join("\n").trim();
}

async function resolveLarkBugContext(
  record: LarkBitableRecord,
  client: LarkRecordAnalyzeClient,
): Promise<LarkBugContext> {
  const messageLink = extractLarkMessageLink(record);
  const messageInfo = messageLink ? parseLarkMessageLink(messageLink) : null;

  if (messageInfo?.threadId) {
    const threadContext = await resolveLarkThreadContext(messageInfo.threadId, client);
    if (threadContext) {
      return {
        bugDescription: threadContext,
        larkThreadContext: threadContext,
      };
    }
  }

  if (messageInfo?.messageId && client.getMessage) {
    const message = await client.getMessage(messageInfo.messageId);
    const messageText = extractLarkMessageContentText(message.content);
    if (messageText) {
      return {
        bugDescription: messageText,
        larkThreadContext: "",
      };
    }
  }

  return {
    bugDescription: getLarkRecordBugDescription(record),
    larkThreadContext: "",
  };
}

async function resolveLarkThreadContext(
  threadId: string,
  client: LarkRecordAnalyzeClient,
): Promise<string> {
  const sections: string[] = [];

  if (client.getMessage) {
    try {
      const threadMessage = await client.getMessage(threadId);
      const threadText = extractLarkMessageContentText(threadMessage.content);
      if (threadText) {
        sections.push(`Thread root message:\n${threadText}`);
      }
    } catch (error) {
      bugLogger.warn({
        threadId,
        message: error instanceof Error ? error.message : String(error),
      }, "LARK_BUG_THREAD_ROOT_MESSAGE_FETCH_FAILED");
    }
  }

  if (client.getThreadMessages) {
    const threadMessages = await client.getThreadMessages(threadId);
    const threadTexts = threadMessages.items
      .slice(0, LARK_THREAD_CONTEXT_MESSAGE_LIMIT)
      .map((item, index) => {
        const text = extractLarkMessageContentText(item.content);
        return text ? `Thread message ${index + 1} (${item.message_id}):\n${text}` : "";
      })
      .filter(Boolean);
    if (threadTexts.length > 0) {
      sections.push(`Thread messages (first ${LARK_THREAD_CONTEXT_MESSAGE_LIMIT}):\n${threadTexts.join("\n\n")}`);
    }
  }

  return sections.join("\n\n").trim();
}

function getLarkRecordBugDescription(record: LarkBitableRecord): string {
  const fields = record.fields;
  return extractTextValue(fields["Issue Description"]) ||
    extractTextValue(fields["Details Description"]) ||
    summarizeLarkRecord(record);
}

function extractLarkMessageLink(record: LarkBitableRecord): string | undefined {
  const possibleFieldNames = [
    "Lark Message Link",
    "Message Link",
    "Thread Link",
    "Chat Link",
    "lark_message_link",
  ];

  for (const name of possibleFieldNames) {
    const raw = record.fields[name];
    const value = extractTextValue(raw);
    if (value && /(?:threadid|chatid|messageid)=/i.test(value)) {
      return extractCleanUrl(value) ?? value;
    }
  }

  return extractCleanUrl(getLarkRecordBugDescription(record));
}

function parseLarkMessageLink(
  link: string,
): { threadId?: string; chatId?: string; messageId?: string } | null {
  try {
    const url = new URL(link);
    const threadId = url.searchParams.get("threadid") || undefined;
    const chatId = url.searchParams.get("chatid") || undefined;
    const messageId = url.searchParams.get("messageid") || undefined;
    if (threadId || chatId || messageId) {
      return { threadId, chatId, messageId };
    }
  } catch {
    // Ignore invalid URLs and fall back to record fields.
  }

  return null;
}

function extractCleanUrl(value: string): string | undefined {
  const markdownMatch = value.match(/\[[^\]]*]\((https?:\/\/[^\s"'<>)]*)\)/i);
  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const urlMatch = value.match(/https?:\/\/[^\s"'<>)\]]+/i);
  return urlMatch?.[0];
}

function extractLarkMessageContentText(content: string | undefined): string {
  if (!content) {
    return "";
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const text = extractLarkMessageContentObjectText(parsed);
    if (text) {
      return text;
    }
  } catch {
    // Plain text content is allowed.
  }

  return content.trim();
}

function extractLarkMessageContentObjectText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map(extractLarkMessageContentObjectText).filter(Boolean).join("\n");
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const directText = extractTextValue(record.text) ||
      extractTextValue(record.content) ||
      extractTextValue(record.title);
    if (directText) {
      return directText;
    }

    return Object.values(record)
      .map(extractLarkMessageContentObjectText)
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

async function appendLarkRecordDetailsDescription(
  client: LarkRecordAnalyzeClient,
  ids: LarkRecordIds,
  record: LarkBitableRecord,
  analysisSummary: string,
): Promise<void> {
  const existingDetails = extractTextValue(record.fields["Details Description"]);
  const nextDetails = [existingDetails, `### Bug 分析\n${analysisSummary}`]
    .filter(Boolean)
    .join("\n\n");

  await client.updateRecord(ids.baseId, ids.tableId, ids.recordId, {
    "Details Description": nextDetails,
  });
}

function getLarkRecordTitle(record: LarkBitableRecord): string {
  const fields = record.fields;
  return extractTextValue(fields["Title"]) ||
    extractTextValue(fields["Issue"]) ||
    extractTextValue(fields["Issue Title"]) ||
    extractTextValue(fields["Issue Description"]) ||
    record.record_id;
}

async function resolveOperatorLarkId(
  masterUserId: string,
  store?: ResolvedUserStore,
): Promise<string> {
  const userStore = store ?? getResolvedUserStore();
  const resolvedUser = await userStore.getById(masterUserId);
  if (!resolvedUser?.larkId) {
    throw new Error("Current user is missing a Lark identity for Kimi ACP.");
  }

  return resolvedUser.larkId;
}

function extractTextValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(extractTextValue).filter(Boolean).join(", ");
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "string") {
      return record.value.trim();
    }
    if (typeof record.text === "string") {
      return record.text.trim();
    }
    if (typeof record.name === "string") {
      return record.name.trim();
    }
  }

  return "";
}

async function refreshDefaultMeegleCredential(input: {
  masterUserId: string;
  meegleUserKey: string;
  baseUrl: string;
}): Promise<CredentialStatus> {
  const authDeps = getConfiguredMeegleAuthServiceDeps();

  return refreshMeegleCredential(input, {
    authAdapter: authDeps.authAdapter,
    tokenStore: authDeps.tokenStore!,
    meegleAuthBaseUrl: authDeps.meegleAuthBaseUrl,
  });
}

async function runProductionBugAnalysis(
  input: {
    operatorLarkId: string;
    bugTitle: string;
    bugFields: string;
    bugDescription: string;
    larkThreadContext?: string;
    promptTemplate: string;
  },
  acpService: AcpKimiProxyService,
  acpLimiter: BugAcpLimiter,
): Promise<string> {
  return acpLimiter.run(async () => {
    const chunks: string[] = [];
    const prompt = buildProductionBugAnalyzePrompt(input);
    const timeoutMs = resolveBugAcpTimeoutMs();
    const abortController = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    try {
      bugLogger.debug({
        prompt,
        promptLength: prompt.length,
        bugTitleLength: input.bugTitle.length,
        bugFieldsLength: input.bugFields.length,
        bugDescriptionLength: input.bugDescription.length,
        larkThreadContextLength: input.larkThreadContext?.length ?? 0,
        hasBugTitle: Boolean(input.bugTitle.trim()),
        hasBugFields: Boolean(input.bugFields.trim()),
        hasBugDescription: Boolean(input.bugDescription.trim()),
        hasLarkThreadContext: Boolean(input.larkThreadContext?.trim()),
      }, "LARK_BUG_ANALYZE_RENDERED_PROMPT");

      await acpService.chatOneShot(
        {
          operatorLarkId: input.operatorLarkId,
          message: prompt,
        },
        (event) => {
          const text = getAgentMessageText(event);
          if (text) {
            chunks.push(text);
          }
        },
        {
          signal: abortController.signal,
        },
      );
    } catch (error) {
      if (abortController.signal.aborted && isAbortError(error)) {
        throw new BugAcpTimeoutError(timeoutMs);
      }

      throw error;
    } finally {
      globalThis.clearTimeout(timeoutId);
    }

    return chunks.join("").trim();
  });
}

export function createBugAcpLimiter(input?: {
  limit?: number | (() => number);
}): BugAcpLimiter {
  let active = 0;

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      const limit = resolveLimiterLimit(input?.limit);
      if (active >= limit) {
        throw new BugAcpConcurrencyLimitError(limit);
      }

      active += 1;
      try {
        return await task();
      } finally {
        active -= 1;
      }
    },
  };
}

const defaultBugAcpLimiter = createBugAcpLimiter({
  limit: resolveBugAcpConcurrencyLimit,
});

function resolveLimiterLimit(limit?: number | (() => number)): number {
  const resolved = typeof limit === "function" ? limit() : limit;
  if (resolved === undefined) {
    return DEFAULT_BUG_ACP_CONCURRENCY_LIMIT;
  }

  if (!Number.isFinite(resolved) || resolved < 0) {
    return DEFAULT_BUG_ACP_CONCURRENCY_LIMIT;
  }

  return Math.floor(resolved);
}

class BugAcpConcurrencyLimitError extends Error {
  readonly code = "ACP_CONCURRENCY_LIMITED";
  readonly stage = "adapter.acp.queue";

  constructor(readonly limit: number) {
    super(
      limit > 0
        ? `Kimi ACP production bug analysis is limited to ${limit} concurrent run(s).`
        : "Kimi ACP production bug analysis is currently unavailable because the concurrency limit is 0.",
    );
    this.name = "BugAcpConcurrencyLimitError";
  }
}

class BugAcpTimeoutError extends Error {
  readonly code = "ACP_ANALYSIS_TIMEOUT";
  readonly stage = "adapter.acp.prompt";

  constructor(readonly timeoutMs: number) {
    super(`Kimi ACP analysis timed out after ${timeoutMs}ms.`);
    this.name = "BugAcpTimeoutError";
  }
}

function resolveBugAcpTimeoutMs(): number {
  const raw = process.env.LARK_BUG_ANALYZE_ACP_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_BUG_ACP_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BUG_ACP_TIMEOUT_MS;
  }

  return parsed;
}

function resolveBugAcpConcurrencyLimit(): number {
  const raw = process.env.LARK_BUG_ANALYZE_ACP_CONCURRENCY_LIMIT;
  if (!raw) {
    return DEFAULT_BUG_ACP_CONCURRENCY_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_BUG_ACP_CONCURRENCY_LIMIT;
  }

  return parsed;
}

async function resolveProductionBugAnalyzePromptTemplate(
  store: WorkflowPromptStore,
): Promise<string> {
  const record = await store.getByKey(LARK_BUG_ANALYZE_PROMPT_KEY);
  const prompt = record?.prompt.trim();
  return prompt || DEFAULT_LARK_BUG_ANALYZE_PROMPT_TEMPLATE;
}

function normalizeAcpError(error: unknown): {
  layer: "adapter";
  stage: string;
  errorCode: string;
  errorMessage: string;
} | null {
  if (error instanceof KimiAcpRuntimeError) {
    return {
      layer: "adapter",
      stage: error.stage,
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  if (error instanceof BugAcpTimeoutError) {
    return {
      layer: "adapter",
      stage: error.stage,
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  if (error instanceof BugAcpConcurrencyLimitError) {
    return {
      layer: "adapter",
      stage: error.stage,
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  if (isAbortError(error)) {
    return {
      layer: "adapter",
      stage: "adapter.acp.prompt",
      errorCode: "ACP_ABORTED",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  return null;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

function getAgentMessageText(event: AcpKimiStreamEvent): string {
  if (event.event !== "acp.session.update") {
    return "";
  }

  const update = event.data.update;
  if (update.sessionUpdate !== "agent_message_chunk") {
    return "";
  }

  const content = update.content;
  if (
    content &&
    typeof content === "object" &&
    (content as Record<string, unknown>).type === "text" &&
    typeof (content as Record<string, unknown>).text === "string"
  ) {
    return (content as Record<string, string>).text;
  }

  return "";
}

function buildProductionBugAnalyzePrompt(input: {
  bugTitle: string;
  bugFields: string;
  bugDescription: string;
  larkThreadContext?: string;
  promptTemplate: string;
}): string {
  return renderWorkflowPromptTemplate(input.promptTemplate, {
    bugTitle: input.bugTitle || "待确认",
    bugFields: input.bugFields || "待确认",
    bug_description: input.bugDescription || "待确认",
    lark_thread_context: input.larkThreadContext || "",
  });
}

function toError(
  stage: string,
  errorCode: string,
  errorMessage: string,
  actionRunId?: string,
  layer: "server" | "adapter" | "platform" = "server",
): LarkBugAnalyzeErrorResponse {
  bugLogger.warn({
    actionRunId,
    layer,
    stage,
    errorCode,
    errorMessage,
  }, "LARK_BUG_ANALYZE_FAIL");

  return {
    ok: false,
    error: {
      layer,
      module: "lark-bug-analyze",
      stage,
      errorCode,
      errorMessage,
      actionRunId,
    },
  };
}
