import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  PostgresPlatformSyncStore,
  type LarkBaseTicketSyncItem,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";
import {
  getWorkflowPromptStore,
  type WorkflowPromptStore,
} from "../../adapters/postgres/workflow-prompt-store.js";
import {
  createTicketSummaryJsonCompletionClient,
  isTicketSummaryClientError,
  type TicketSummaryClientErrorCode,
  type TicketSummaryJsonCompletionClient,
} from "../../adapters/ai/ticket-summary-client.js";
import {
  supportQualityUpdateSchema,
  supportResultUpdateSchema,
} from "../../domain/support-ticket-analysis-update.js";
import {
  SUPPORT_INTENT_TYPES,
  type PreparedTicketMessage,
} from "../../domain/support-ticket-analysis.js";
import {
  DEFAULT_LARK_TICKET_SUPPORT_QA_PROMPTS,
  renderWorkflowPromptTemplate,
} from "../../domain/workflow-prompts.js";
import type { LarkTicketThreadSnapshot } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import { logger } from "../../logger.js";
import {
  createLarkTicketThreadContextService,
  type LarkTicketThreadContextResult,
} from "./lark-ticket-thread-context.service.js";

const shadowLogger = logger.child({ module: "lark-ticket-shadow-summary" });

export const LARK_TICKET_SHADOW_SUMMARY_PROMPT_KEY = "lark_ticket.support_qa.summarize";
export const LARK_TICKET_SHADOW_SUMMARY_SOURCE = "shadow-worker";
export const LARK_TICKET_SHADOW_SUMMARY_PROMPT_VERSION = "v4";

const DEFAULT_SETTLE_MS = 3 * 60 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 5;
const DEFAULT_POLL_INTERVAL_MS = 60 * 60 * 1000;
const MAX_MESSAGE_CHARS = 1000;
const MAX_CONTEXT_CHARS = 30_000;

const shadowIntentSchema = z.object({
  intentType: z.enum(SUPPORT_INTENT_TYPES),
  intentSubtype: z.string().trim().min(1).max(500).optional().nullable(),
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1).max(2000),
  keywords: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  evidenceMessageIds: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
}).strict();

const shadowAnalysisResultSchema = z.object({
  version: z.literal("support-analysis-result-v1"),
  analysis: z.object({
    segmentKey: z.string().trim().min(1).max(120).default("primary"),
    intent: shadowIntentSchema,
    result: supportResultUpdateSchema,
    quality: supportQualityUpdateSchema,
  }).strict(),
  summary: z.string().trim().min(1).max(2000),
}).strict();

export type ShadowAnalysisResult = z.infer<typeof shadowAnalysisResultSchema>;

export type ShadowSummaryErrorCode =
  | "SHADOW_PROMPT_NOT_CONFIGURED"
  | "SHADOW_THREAD_UNAVAILABLE"
  | TicketSummaryClientErrorCode
  | "SHADOW_OUTPUT_INVALID"
  | "SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT";

export class LarkTicketShadowSummaryError extends Error {
  constructor(
    readonly code: ShadowSummaryErrorCode,
    message: string,
    readonly stage: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LarkTicketShadowSummaryError";
  }
}

export interface ShadowSummaryRunResult {
  considered: number;
  summarized: number;
  skipped: number;
  failed: number;
}

interface ThreadContextLike {
  ensure(input: {
    masterUserId: string;
    larkBaseUrl: string;
    ticket: LarkBaseTicketSyncItem;
    forceFull?: boolean;
  }): Promise<LarkTicketThreadContextResult>;
}

export interface LarkTicketShadowSummaryServiceDeps {
  syncStore?: Pick<PlatformSyncStore, "listLarkTicketShadowSummaryCandidates" | "upsertLarkBaseTicketShadowAi">;
  threadContext?: ThreadContextLike;
  ticketSummaryClient?: TicketSummaryJsonCompletionClient;
  summaryTimeoutMs?: number;
  promptStore?: Pick<WorkflowPromptStore, "getByKey">;
  masterUserId?: string;
  larkBaseUrl?: string;
  settleMs?: number;
  batchLimit?: number;
  pollIntervalMs?: number;
  promptKey?: string;
  now?: () => Date;
}

export function createLarkTicketShadowSummaryService(deps: LarkTicketShadowSummaryServiceDeps = {}) {
  const syncStore = deps.syncStore ?? new PostgresPlatformSyncStore();
  const threadContext = deps.threadContext ?? createLarkTicketThreadContextService();
  const getTicketSummaryClient = () => deps.ticketSummaryClient ?? createTicketSummaryJsonCompletionClient(
    deps.summaryTimeoutMs ? { timeoutMs: deps.summaryTimeoutMs } : {},
  );
  const promptStore = deps.promptStore ?? getWorkflowPromptStore();
  const now = deps.now ?? (() => new Date());
  const settleMs = deps.settleMs ?? readPositiveInt(process.env.LARK_TICKET_SHADOW_SUMMARY_SETTLE_MS, DEFAULT_SETTLE_MS);
  const batchLimit = deps.batchLimit ?? readPositiveInt(process.env.LARK_TICKET_SHADOW_SUMMARY_BATCH_LIMIT, DEFAULT_BATCH_LIMIT);
  const pollIntervalMs = deps.pollIntervalMs ?? readPositiveInt(process.env.LARK_TICKET_SHADOW_SUMMARY_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
  const promptKey = deps.promptKey ?? LARK_TICKET_SHADOW_SUMMARY_PROMPT_KEY;

  async function writeShadow(ticket: LarkBaseTicketSyncItem, shadow: Record<string, unknown>): Promise<void> {
    await syncStore.upsertLarkBaseTicketShadowAi({
      baseId: ticket.baseId,
      tableId: ticket.tableId,
      recordId: ticket.recordId,
      shadow,
    });
  }

  async function summarizeTicket(
    ticket: LarkBaseTicketSyncItem,
    promptTemplate: string,
  ): Promise<"ok" | "skipped"> {
    const actionRunId = randomUUID();
    const analyzedAt = now().toISOString();
    const baseLog = {
      operation: "lark_ticket_shadow_summary",
      layer: "server",
      actionRunId,
      baseId: ticket.baseId,
      tableId: ticket.tableId,
      recordId: ticket.recordId,
      ticketNumber: ticket.ticketNumber,
    };
    try {
      if (!deps.masterUserId) {
        throw new LarkTicketShadowSummaryError(
          "SHADOW_THREAD_UNAVAILABLE",
          "Shadow summary requires a master user to fetch the Lark thread.",
          "server.shadow.config",
        );
      }
      const thread = await threadContext.ensure({
        masterUserId: deps.masterUserId,
        larkBaseUrl: deps.larkBaseUrl ?? process.env.LARK_BASE_URL ?? "https://open.feishu.cn",
        ticket,
      });
      const snapshot = thread.snapshot;
      if (thread.source === "none" || !snapshot || snapshot.preparedMessages.length === 0) {
        await writeShadow(ticket, {
          status: "skipped",
          reason: thread.source === "none" ? "no_thread_link" : "no_messages",
          analyzedAt,
          actionRunId,
          source: LARK_TICKET_SHADOW_SUMMARY_SOURCE,
        });
        shadowLogger.info({ ...baseLog, stage: "server.shadow.skipped", reason: thread.source }, "LARK_TICKET_SHADOW_SUMMARY_SKIPPED");
        return "skipped";
      }

      const prompt = renderWorkflowPromptTemplate(promptTemplate, {
        ticket_context: buildTicketContext(ticket, snapshot),
        user_message: readUserMessage(ticket),
      });
      const completion = await runTicketSummaryCompletion(getTicketSummaryClient, prompt, actionRunId);
      const analysis = parseShadowAnalysis(completion.content);
      assertEvidenceWithinSnapshot(analysis, snapshot.preparedMessages);

      await writeShadow(ticket, {
        status: "ok",
        analysis,
        analyzedAt,
        snapshotVersion: snapshot.snapshotVersion,
        promptKey,
        promptVersion: LARK_TICKET_SHADOW_SUMMARY_PROMPT_VERSION,
        actionRunId,
        source: LARK_TICKET_SHADOW_SUMMARY_SOURCE,
      });
      shadowLogger.info({
        ...baseLog,
        stage: "server.shadow.completed",
        snapshotVersion: snapshot.snapshotVersion,
        intentType: analysis.analysis.intent.intentType,
        confidence: analysis.analysis.intent.confidence,
      }, "LARK_TICKET_SHADOW_SUMMARY_COMPLETED");
      return "ok";
    } catch (error) {
      const shadowError = toShadowError(error);
      await writeShadow(ticket, {
        status: "error",
        error: {
          errorCode: shadowError.code,
          errorMessage: shadowError.message.slice(0, 500),
          ...shadowError.details,
        },
        analyzedAt,
        actionRunId,
        source: LARK_TICKET_SHADOW_SUMMARY_SOURCE,
      });
      shadowLogger.warn({
        ...baseLog,
        stage: shadowError.stage,
        errorCode: shadowError.code,
        errorMessage: shadowError.message,
        ...shadowError.details,
      }, "LARK_TICKET_SHADOW_SUMMARY_FAILED");
      throw shadowError;
    }
  }

  async function runOnce(): Promise<ShadowSummaryRunResult> {
    const promptRecord = await promptStore.getByKey(promptKey);
    const promptTemplate = promptRecord?.prompt.trim()
      || DEFAULT_LARK_TICKET_SUPPORT_QA_PROMPTS[promptKey];
    if (!promptTemplate) {
      throw new LarkTicketShadowSummaryError(
        "SHADOW_PROMPT_NOT_CONFIGURED",
        `Workflow prompt ${promptKey} is not configured.`,
        "server.shadow.config",
      );
    }
    const olderThan = new Date(now().getTime() - settleMs).toISOString();
    const candidates = await syncStore.listLarkTicketShadowSummaryCandidates({ olderThan, limit: batchLimit });
    const result: ShadowSummaryRunResult = { considered: candidates.length, summarized: 0, skipped: 0, failed: 0 };
    for (const ticket of candidates) {
      try {
        const outcome = await summarizeTicket(ticket, promptTemplate);
        if (outcome === "skipped") {
          result.skipped += 1;
        } else {
          result.summarized += 1;
        }
      } catch {
        result.failed += 1;
      }
    }
    return result;
  }

  return {
    runOnce,

    async run(signal: AbortSignal): Promise<void> {
      while (!signal.aborted) {
        let runResult: ShadowSummaryRunResult | undefined;
        try {
          runResult = await runOnce();
        } catch (error) {
          shadowLogger.error({
            operation: "lark_ticket_shadow_summary",
            layer: "server",
            stage: "server.shadow.poll",
            errorMessage: error instanceof Error ? error.message : String(error),
          }, "LARK_TICKET_SHADOW_SUMMARY_POLL_FAILED");
        }
        if (runResult) {
          shadowLogger.info({
            operation: "lark_ticket_shadow_summary",
            layer: "server",
            stage: "server.shadow.poll",
            ...runResult,
          }, "LARK_TICKET_SHADOW_SUMMARY_POLL_DONE");
        }
        await abortableDelay(pollIntervalMs, signal);
      }
    },
  };
}

function buildTicketContext(ticket: LarkBaseTicketSyncItem, snapshot: LarkTicketThreadSnapshot): string {
  const fields = ticket.sourceFields ?? {};
  const lines = [
    `ticket_number: ${ticket.ticketNumber ?? ""}`,
    `title: ${ticket.title}`,
    `ticket_status: ${ticket.ticketStatus ?? ""}`,
    `issue 类型: ${ticket.issueType ?? ""}`,
    `business line: ${readFieldText(fields, "Business line")}`,
    "",
    "Issue Description:",
    readFieldText(fields, "Issue Description"),
    "",
    "Lark thread context（脱敏快照，text 为 Lark 消息原始内容）：",
  ];
  let budget = MAX_CONTEXT_CHARS;
  for (const message of snapshot.preparedMessages) {
    const text = (message.text || "").slice(0, MAX_MESSAGE_CHARS);
    const entry = `- [${message.messageId}] ${message.senderLabel ?? message.senderRole} @ ${message.createdAt ?? ""}: ${text}`;
    if (budget - entry.length < 0) {
      lines.push("- ...（后续消息因长度截断）");
      break;
    }
    budget -= entry.length;
    lines.push(entry);
  }
  return lines.join("\n");
}

function readUserMessage(ticket: LarkBaseTicketSyncItem): string {
  const description = readFieldText(ticket.sourceFields ?? {}, "Issue Description");
  return description || ticket.title;
}

function readFieldText(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  return typeof value === "string" ? value.trim() : "";
}

function outputDiagnostics(text: string): Record<string, unknown> {
  return {
    outputChars: text.length,
  };
}

async function runTicketSummaryCompletion(
  getClient: () => TicketSummaryJsonCompletionClient,
  prompt: string,
  actionRunId: string,
): Promise<{ content: string; model: string }> {
  try {
    return await getClient().createJsonCompletion({ prompt, actionRunId });
  } catch (error) {
    if (isTicketSummaryClientError(error)) throw error;
    throw new LarkTicketShadowSummaryError(
      "DEEPSEEK_REQUEST_FAILED",
      "Ticket summary request failed before a valid response was received.",
      "adapter.ticket_summary.request",
    );
  }
}

function parseShadowAnalysis(text: string): ShadowAnalysisResult {
  if (!text) {
    throw new LarkTicketShadowSummaryError(
      "SHADOW_OUTPUT_INVALID",
      "Shadow Ticket summary output was empty.",
      "server.shadow.parse",
      outputDiagnostics(text),
    );
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    shadowLogger.debug({
      operation: "lark_ticket_shadow_summary",
      layer: "server",
      stage: "server.shadow.parse",
      outputLength: text.length,
    }, "LARK_TICKET_SHADOW_SUMMARY_PARSE_EMPTY");
    throw new LarkTicketShadowSummaryError(
      "SHADOW_OUTPUT_INVALID",
      "Shadow Ticket summary output did not contain a JSON object.",
      "server.shadow.parse",
      outputDiagnostics(text),
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    shadowLogger.debug({
      operation: "lark_ticket_shadow_summary",
      layer: "server",
      stage: "server.shadow.parse",
      outputLength: text.length,
    }, "LARK_TICKET_SHADOW_SUMMARY_PARSE_JSON_FAILED");
    throw new LarkTicketShadowSummaryError(
      "SHADOW_OUTPUT_INVALID",
      `Shadow Ticket summary output JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      "server.shadow.parse",
      outputDiagnostics(text),
    );
  }
  const result = shadowAnalysisResultSchema.safeParse(parsed);
  if (!result.success) {
    shadowLogger.debug({
      operation: "lark_ticket_shadow_summary",
      layer: "server",
      stage: "server.shadow.validate",
      outputLength: text.length,
    }, "LARK_TICKET_SHADOW_SUMMARY_PARSE_SCHEMA_FAILED");
    throw new LarkTicketShadowSummaryError(
      "SHADOW_OUTPUT_INVALID",
      `Shadow Ticket summary output failed schema validation: ${result.error.issues.map((issue) => issue.path.join(".") || issue.code).join(", ").slice(0, 300)}`,
      "server.shadow.validate",
      outputDiagnostics(text),
    );
  }
  return result.data;
}

function assertEvidenceWithinSnapshot(analysis: ShadowAnalysisResult, messages: PreparedTicketMessage[]): void {
  const known = new Set(messages.map((message) => message.messageId));
  const outside = analysis.analysis.intent.evidenceMessageIds.filter((id) => !known.has(id));
  if (outside.length > 0) {
    throw new LarkTicketShadowSummaryError(
      "SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT",
      `Evidence message IDs outside the fixed snapshot: ${outside.slice(0, 3).join(", ")}`,
      "server.shadow.validate",
    );
  }
}

function toShadowError(error: unknown): LarkTicketShadowSummaryError {
  if (error instanceof LarkTicketShadowSummaryError) return error;
  if (isTicketSummaryClientError(error)) {
    const stage = error.code === "DEEPSEEK_API_KEY_MISSING" || error.code === "ZCODE_API_KEY_MISSING" || error.code === "TICKET_SUMMARY_PROVIDER_INVALID"
      ? "adapter.ticket_summary.config"
      : error.code === "DEEPSEEK_TIMEOUT" || error.code === "ZCODE_TIMEOUT"
        ? "adapter.ticket_summary.timeout"
        : "adapter.ticket_summary.response";
    return new LarkTicketShadowSummaryError(
      error.code,
      error.message,
      stage,
      "statusCode" in error && typeof error.statusCode === "number"
        ? { statusCode: error.statusCode }
        : undefined,
    );
  }
  return new LarkTicketShadowSummaryError(
    "SHADOW_THREAD_UNAVAILABLE",
    error instanceof Error ? error.message : String(error),
    "server.shadow.thread",
  );
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      globalThis.clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
