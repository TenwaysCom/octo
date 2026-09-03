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
  supportQualityUpdateSchema,
  supportResultUpdateSchema,
} from "../../domain/support-ticket-analysis-update.js";
import {
  SUPPORT_INTENT_TYPES,
  type PreparedTicketMessage,
} from "../../domain/support-ticket-analysis.js";
import { renderWorkflowPromptTemplate } from "../../domain/workflow-prompts.js";
import type { LarkTicketThreadSnapshot } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import { logger } from "../../logger.js";
import { acpKimiProxyService } from "./acp-kimi-proxy.service.js";
import {
  createLarkTicketThreadContextService,
  type LarkTicketThreadContextResult,
} from "./lark-ticket-thread-context.service.js";

const shadowLogger = logger.child({ module: "lark-ticket-shadow-summary" });

export const LARK_TICKET_SHADOW_SUMMARY_PROMPT_KEY = "lark_ticket.support_qa.summarize";
export const LARK_TICKET_SHADOW_SUMMARY_SOURCE = "shadow-worker";
export const LARK_TICKET_SHADOW_SUMMARY_PROMPT_VERSION = "v2";

const DEFAULT_SETTLE_MS = 3 * 60 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 5;
const DEFAULT_ACP_TIMEOUT_MS = 300_000;
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
  | "SHADOW_ACP_TIMEOUT"
  | "SHADOW_ACP_FAILED"
  | "SHADOW_OUTPUT_INVALID"
  | "SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT";

export class LarkTicketShadowSummaryError extends Error {
  constructor(
    readonly code: ShadowSummaryErrorCode,
    message: string,
    readonly stage: string,
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

interface AcpOneShotLike {
  chatOneShot(
    input: { operatorLarkId: string; message: string },
    emit: (event: AcpKimiStreamEvent) => void,
    deps?: { signal?: AbortSignal },
  ): Promise<unknown>;
}

export interface LarkTicketShadowSummaryServiceDeps {
  syncStore?: Pick<PlatformSyncStore, "listLarkTicketShadowSummaryCandidates" | "upsertLarkBaseTicketShadowAi">;
  threadContext?: ThreadContextLike;
  acpService?: AcpOneShotLike;
  promptStore?: Pick<WorkflowPromptStore, "getByKey">;
  masterUserId?: string;
  larkBaseUrl?: string;
  settleMs?: number;
  batchLimit?: number;
  acpTimeoutMs?: number;
  pollIntervalMs?: number;
  promptKey?: string;
  now?: () => Date;
}

export function createLarkTicketShadowSummaryService(deps: LarkTicketShadowSummaryServiceDeps = {}) {
  const syncStore = deps.syncStore ?? new PostgresPlatformSyncStore();
  const threadContext = deps.threadContext ?? createLarkTicketThreadContextService();
  const acpService = deps.acpService ?? acpKimiProxyService;
  const promptStore = deps.promptStore ?? getWorkflowPromptStore();
  const now = deps.now ?? (() => new Date());
  const settleMs = deps.settleMs ?? readPositiveInt(process.env.LARK_TICKET_SHADOW_SUMMARY_SETTLE_MS, DEFAULT_SETTLE_MS);
  const batchLimit = deps.batchLimit ?? readPositiveInt(process.env.LARK_TICKET_SHADOW_SUMMARY_BATCH_LIMIT, DEFAULT_BATCH_LIMIT);
  const acpTimeoutMs = deps.acpTimeoutMs ?? readPositiveInt(process.env.LARK_TICKET_SHADOW_SUMMARY_ACP_TIMEOUT_MS, DEFAULT_ACP_TIMEOUT_MS);
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
      const text = await runAcpPrompt(prompt, acpTimeoutMs);
      const analysis = parseShadowAnalysis(text);
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
      }, "LARK_TICKET_SHADOW_SUMMARY_FAILED");
      throw shadowError;
    }
  }

  async function runAcpPrompt(prompt: string, timeoutMs: number): Promise<string> {
    const chunks: string[] = [];
    const abortController = new AbortController();
    const timeoutId = globalThis.setTimeout(() => abortController.abort(), timeoutMs);
    try {
      await acpService.chatOneShot(
        { operatorLarkId: LARK_TICKET_SHADOW_SUMMARY_SOURCE, message: prompt },
        (event) => {
          const text = getAgentMessageText(event);
          if (text) chunks.push(text);
        },
        { signal: abortController.signal },
      );
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new LarkTicketShadowSummaryError(
          "SHADOW_ACP_TIMEOUT",
          `Shadow ACP prompt timed out after ${timeoutMs}ms.`,
          "adapter.acp.prompt",
        );
      }
      throw new LarkTicketShadowSummaryError(
        "SHADOW_ACP_FAILED",
        error instanceof Error ? error.message : String(error),
        "adapter.acp.prompt",
      );
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
    return chunks.join("").trim();
  }

  async function runOnce(): Promise<ShadowSummaryRunResult> {
    const promptRecord = await promptStore.getByKey(promptKey);
    if (!promptRecord?.prompt?.trim()) {
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
        const outcome = await summarizeTicket(ticket, promptRecord.prompt);
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

function parseShadowAnalysis(text: string): ShadowAnalysisResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new LarkTicketShadowSummaryError(
      "SHADOW_OUTPUT_INVALID",
      "Shadow ACP output did not contain a JSON object.",
      "server.shadow.parse",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    throw new LarkTicketShadowSummaryError(
      "SHADOW_OUTPUT_INVALID",
      `Shadow ACP output JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      "server.shadow.parse",
    );
  }
  const result = shadowAnalysisResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new LarkTicketShadowSummaryError(
      "SHADOW_OUTPUT_INVALID",
      `Shadow ACP output failed schema validation: ${result.error.issues.map((issue) => issue.path.join(".") || issue.code).join(", ").slice(0, 300)}`,
      "server.shadow.validate",
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
  return new LarkTicketShadowSummaryError(
    "SHADOW_THREAD_UNAVAILABLE",
    error instanceof Error ? error.message : String(error),
    "server.shadow.thread",
  );
}

function getAgentMessageText(event: AcpKimiStreamEvent): string {
  if (event.event !== "acp.session.update") return "";
  const update = event.data.update;
  if (update.sessionUpdate !== "agent_message_chunk") return "";
  const content = update.content;
  if (
    content
    && typeof content === "object"
    && (content as Record<string, unknown>).type === "text"
    && typeof (content as Record<string, unknown>).text === "string"
  ) {
    return (content as Record<string, unknown>).text as string;
  }
  return "";
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
