import { createWikiQaService } from "./wiki-qa.service.js";
import { WikiQaError } from "../../domain/wiki-qa.js";
import { buildShadowWikiContext, renderShadowWikiInput, hasInvalidShadowWikiReferences, type ShadowWikiContext } from "../../domain/shadow-wiki-context.js";
import { resolveTicketThreadEvidence } from "../../domain/ticket-thread-ai-context.js";
import { buildShadowTicketContext } from "../../domain/shadow-ticket-context.js";
import { shadowBusinessRiskSchema, shadowReplyAdviceSchema } from "../../domain/shadow-analysis.js";
import { DEFAULT_SHADOW_SUMMARY_PROMPT, SHADOW_SUMMARY_PROMPT_KEY, SHADOW_SUMMARY_RULE_VERSION } from "../../domain/shadow-summary-prompt.js";
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
  SUPPORT_INTENT_SUBTYPES,
} from "../../domain/support-ticket-analysis.js";
import {
  renderWorkflowPromptTemplate,
} from "../../domain/workflow-prompts.js";
import { logger } from "../../logger.js";
import {
  createLarkTicketThreadContextService,
  type LarkTicketThreadContextResult,
} from "./lark-ticket-thread-context.service.js";

const shadowLogger = logger.child({ module: "lark-ticket-shadow-summary" });

export const LARK_TICKET_SHADOW_SUMMARY_PROMPT_KEY = SHADOW_SUMMARY_PROMPT_KEY;
export const LARK_TICKET_SHADOW_SUMMARY_SOURCE = "shadow-worker";
export const LARK_TICKET_SHADOW_SUMMARY_PROMPT_VERSION = "v6";

const DEFAULT_SETTLE_MS = 3 * 60 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 5;
const DEFAULT_POLL_INTERVAL_MS = 60 * 60 * 1000;

const shadowIntentSchema = z.object({
  intentType: z.enum(SUPPORT_INTENT_TYPES),
  intentSubtype: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1).max(2000),
  keywords: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  evidenceMessageIds: z.array(z.string().trim().min(1).max(200)).max(100).transform((ids) => [...new Set(ids)]),
}).strict();

const shadowAnalysisResultSchema = z.object({
  version: z.literal("shadow-analysis-result-v2"),
  analysis: z.object({
    segmentKey: z.string().trim().min(1).max(120).default("primary"),
    intent: shadowIntentSchema,
    result: supportResultUpdateSchema,
    quality: supportQualityUpdateSchema,
    businessRisk: shadowBusinessRiskSchema.strict(),
    replyAdvice: shadowReplyAdviceSchema.strict(),
  }).strict(),
  summary: z.string().trim().min(1).max(2000),
}).strict().superRefine((value, context) => {
  const { intentType, intentSubtype } = value.analysis.intent;
  if (!SUPPORT_INTENT_SUBTYPES[intentType].includes(intentSubtype)) {
    context.addIssue({ code: "custom", path: ["analysis", "intent", "intentSubtype"], message: "Subtype must belong to its intent type." });
  }
});

export type ShadowAnalysisResult = z.infer<typeof shadowAnalysisResultSchema>;

export type ShadowSummaryErrorCode =
  | "SHADOW_PROMPT_NOT_CONFIGURED"
  | "SHADOW_THREAD_UNAVAILABLE"
  | TicketSummaryClientErrorCode
  | "SHADOW_OUTPUT_INVALID"
  | "SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT"
  | "SHADOW_WIKI_REFERENCE_INVALID";

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
  wikiQaService?: Pick<ReturnType<typeof createWikiQaService>, "retrieve">;
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
    const processingStartedAt = now();
    const analyzedAt = processingStartedAt.toISOString();
    const processingDurationMs = () => Math.max(0, now().getTime() - processingStartedAt.getTime());
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
        const durationMs = processingDurationMs();
        await writeShadow(ticket, {
          status: "skipped",
          reason: thread.source === "none" ? "no_thread_link" : "no_messages",
          analyzedAt,
          processingDurationMs: durationMs,
          actionRunId,
          source: LARK_TICKET_SHADOW_SUMMARY_SOURCE,
        });
        shadowLogger.info({ ...baseLog, stage: "server.shadow.skipped", reason: thread.source, processingDurationMs: durationMs }, "LARK_TICKET_SHADOW_SUMMARY_SKIPPED");
        return "skipped";
      }

      const context = buildShadowTicketContext(ticket, snapshot, thread.source, analyzedAt);
      let wiki: ReturnType<typeof buildShadowWikiContext>;
      try {
        const wikiService = deps.wikiQaService ?? createWikiQaService({ client: getTicketSummaryClient(), promptStore });
        const retrieved = await wikiService.retrieve({ ticketContext: context.text, actionRunId });
        wiki = buildShadowWikiContext(retrieved.evidence);
      } catch (error) {
        const errorCode: ShadowWikiContext["errorCode"] = error instanceof WikiQaError ? error.code : "SHADOW_WIKI_UNAVAILABLE";
        wiki = buildShadowWikiContext([], errorCode);
        shadowLogger.warn({ ...baseLog, stage: "server.shadow.wiki", errorCode }, "LARK_TICKET_SHADOW_WIKI_UNAVAILABLE");
      }
      shadowLogger.info({ ...baseLog, stage: "server.shadow.wiki", wikiStatus: wiki.info.status, sourceCount: wiki.info.sources.length }, "LARK_TICKET_SHADOW_WIKI_READY");
      const prompt = [renderWorkflowPromptTemplate(promptTemplate, {
        ticket_context: context.text,
        user_message: "请分析上述 Ticket；问题描述已包含在上下文中。",
      }), renderShadowWikiInput(wiki)].join("\n\n");
      const completion = await runTicketSummaryCompletion(getTicketSummaryClient, prompt, actionRunId);
      const analysis = parseShadowAnalysis(completion.content, actionRunId);
      resolveEvidenceWithinInput(analysis, context.evidenceIds);
      if (hasInvalidShadowWikiReferences(analysis, new Set(wiki.info.sources.map((source) => source.sourceId)))) {
        throw new LarkTicketShadowSummaryError("SHADOW_WIKI_REFERENCE_INVALID", "Shadow analysis referenced Wiki sources not provided to this run.", "server.shadow.validate");
      }

      const durationMs = processingDurationMs();
      await writeShadow(ticket, {
        status: "ok",
        analysis,
        analyzedAt,
        processingDurationMs: durationMs,
        snapshotVersion: snapshot.snapshotVersion,
        contextInfo: context.info,
        wikiContext: wiki.info,
        wikiEvidence: wiki.evidence,
        ruleVersion: SHADOW_SUMMARY_RULE_VERSION,
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
        processingDurationMs: durationMs,
      }, "LARK_TICKET_SHADOW_SUMMARY_COMPLETED");
      return "ok";
    } catch (error) {
      const shadowError = toShadowError(error);
      const durationMs = processingDurationMs();
      await writeShadow(ticket, {
        status: "error",
        error: {
          errorCode: shadowError.code,
          errorMessage: shadowError.message.slice(0, 500),
          ...shadowError.details,
        },
        analyzedAt,
        processingDurationMs: durationMs,
        actionRunId,
        source: LARK_TICKET_SHADOW_SUMMARY_SOURCE,
      });
      shadowLogger.warn({
        ...baseLog,
        stage: shadowError.stage,
        errorCode: shadowError.code,
        errorMessage: shadowError.message,
        processingDurationMs: durationMs,
        ...shadowError.details,
      }, "LARK_TICKET_SHADOW_SUMMARY_FAILED");
      throw shadowError;
    }
  }

  async function runOnce(): Promise<ShadowSummaryRunResult> {
    const promptRecord = await promptStore.getByKey(promptKey);
    const promptTemplate = promptRecord?.prompt.trim()
      || (promptKey === SHADOW_SUMMARY_PROMPT_KEY ? DEFAULT_SHADOW_SUMMARY_PROMPT : undefined);
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

function parseShadowAnalysis(text: string, actionRunId: string): ShadowAnalysisResult {
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
      actionRunId,
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
      actionRunId,
      layer: "server",
      stage: "server.shadow.parse",
      outputLength: text.length,
    }, "LARK_TICKET_SHADOW_SUMMARY_PARSE_JSON_FAILED");
    throw new LarkTicketShadowSummaryError(
      "SHADOW_OUTPUT_INVALID",
      "Shadow Ticket summary output JSON parse failed.",
      "server.shadow.parse",
      outputDiagnostics(text),
    );
  }
  const result = shadowAnalysisResultSchema.safeParse(parsed);
  if (!result.success) {
    const schemaIssues = safeSchemaIssues(parsed, result.error.issues);
    shadowLogger.debug({
      operation: "lark_ticket_shadow_summary",
      actionRunId,
      layer: "server",
      stage: "server.shadow.validate",
      outputLength: text.length,
      schemaIssues,
    }, "LARK_TICKET_SHADOW_SUMMARY_PARSE_SCHEMA_FAILED");
    throw new LarkTicketShadowSummaryError(
      "SHADOW_OUTPUT_INVALID",
      `Shadow Ticket summary output failed schema validation: ${schemaIssues.map((issue) => `${issue.path}:${issue.reason}`).join(", ").slice(0, 300)}`,
      "server.shadow.validate",
      { ...outputDiagnostics(text), schemaIssues },
    );
  }
  return result.data;
}

function resolveEvidenceWithinInput(analysis: ShadowAnalysisResult, known: Map<string, string>): void {
  for (const section of [analysis.analysis.intent, analysis.analysis.businessRisk, analysis.analysis.replyAdvice]) {
    const resolved = resolveTicketThreadEvidence(section.evidenceMessageIds, known);
    if (!resolved) {
      throw new LarkTicketShadowSummaryError(
        "SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT",
        "Evidence references must belong to messages actually presented to the model.",
        "server.shadow.validate",
      );
    }
    section.evidenceMessageIds = resolved;
  }
}

// Never include model values, unknown property names or Zod's raw messages.
function safeSchemaIssues(parsed: unknown, issues: z.core.$ZodIssue[]) {
  const allowed = new Set([
    "version", "analysis", "summary", "segmentKey", "intent", "intentType", "intentSubtype", "confidence",
    "keywords", "evidenceMessageIds", "result", "resolutionStatus", "solutionSummary", "solutionSteps",
    "resolverRef", "resolvedAt", "autoResolvable", "suggestedAutomation", "quality", "scores",
    "criticalIssues", "warnings", "businessRisk", "level", "rationale", "replyAdvice", "advice",
  ]);
  return issues.slice(0, 20).map((issue) => {
    let value: unknown = parsed;
    for (const part of issue.path) {
      value = value && typeof value === "object" ? (value as Record<PropertyKey, unknown>)[part] : undefined;
    }
    const reason = value === undefined ? "missing" : issue.code === "invalid_type" ? "type"
      : issue.code === "too_small" || issue.code === "too_big" ? "range" : issue.code;
    return {
      path: issue.path.map((part, index) => typeof part === "number" ? "[]"
        : index > 0 && issue.path[index - 1] === "scores" ? "[key]"
          : allowed.has(String(part)) ? String(part) : "[field]").join(".") || "root",
      reason,
    };
  });
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
