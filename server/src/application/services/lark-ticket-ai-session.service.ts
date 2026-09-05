import type { AcpKimiProxyService } from "./acp-kimi-proxy.service.js";
import { acpKimiProxyService } from "./acp-kimi-proxy.service.js";
import {
  createTicketSummaryJsonCompletionClient,
  isTicketSummaryClientError,
  type TicketSummaryClientErrorCode,
  type TicketSummaryJsonCompletionClient,
} from "../../adapters/ai/ticket-summary-client.js";
import {
  extractAcpKimiExecuteCall,
  extractAcpKimiRawCommand,
  isAcpKimiSupportQaFetchExecuteCall,
  isAcpKimiSupportQaFetchCommand,
  type AcpKimiPermissionContext,
} from "./acp-kimi-permission-policy.js";
import { acpKimiSessionHistoryService } from "./acp-kimi-session-history.service.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import {
  getAcpKimiSessionOwnershipStore,
  type AcpKimiSessionOwnershipRecord,
  type AcpKimiSessionOwnershipStore,
} from "../../adapters/postgres/acp-kimi-session-ownership-store.js";
import {
  PostgresPlatformSyncStore,
  type LarkBaseTicketSyncItem,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";
import {
  AUTOMATION_SKILL_PROFILES,
  getTicketAiAutomationAction,
  type KimiTicketAiAutomationActionConfig,
  type TicketSummaryTicketAiAutomationActionConfig,
} from "../../modules/public-config/automation-actions.config.js";
import {
  getWorkflowPromptStore,
  type WorkflowPromptStore,
} from "../../adapters/postgres/workflow-prompt-store.js";
import {
  getSupportKnowledgeStore,
  type SupportKnowledgeRetriever,
  type SupportKnowledgeSearchHit,
} from "../../adapters/postgres/support-knowledge-store.js";
import {
  DEFAULT_LARK_TICKET_SUPPORT_QA_PROMPTS,
  renderWorkflowPromptTemplate,
} from "../../domain/workflow-prompts.js";
import { prepareTicketThread, redactSupportText } from "../../domain/support-ticket-analysis.js";
import { buildSupportQaFetchInstruction, supportAnalysisResultSchema } from "../../domain/support-ticket-analysis-update.js";
import { createSupportTicketAnalysisService, SupportTicketAnalysisError } from "./support-ticket-analysis.service.js";
import { randomUUID } from "node:crypto";
import { access, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { relative, resolve } from "node:path";
import {
  createLarkTicketThreadContextService,
  LarkTicketThreadContextError,
  type LarkTicketThreadContextResult,
  type LarkTicketThreadContextService,
} from "./lark-ticket-thread-context.service.js";

export interface LarkTicketAiSessionRef {
  baseId: string;
  tableId: string;
  recordId: string;
}

const LARK_TICKET_SUPPORT_QA_SUMMARIZE_ACTION_KEY = "lark-ticket-support-qa-summarize";

export class LarkTicketAiSessionError extends Error {
  constructor(
    readonly code:
      | "LARK_TICKET_NOT_FOUND"
      | "SESSION_NOT_FOUND"
      | "SESSION_FORBIDDEN"
      | "AI_ACTION_NOT_FOUND"
      | "SKILL_PROFILE_NOT_CONFIGURED"
      | "LARK_THREAD_CONTEXT_UNAVAILABLE"
      | "SUPPORT_QA_EVIDENCE_NOT_FETCHED"
      | "SUPPORT_ANALYSIS_NOT_UPDATED"
      | TicketSummaryClientErrorCode
      | "TICKET_SUMMARY_OUTPUT_INVALID"
      | "TICKET_SUMMARY_EVIDENCE_OUTSIDE_SNAPSHOT"
      | "THREAD_SNAPSHOT_VERSION_CONFLICT",
    message: string,
    readonly diagnostic?: {
      layer: "server" | "adapter";
      module: string;
      stage: string;
      actionRunId?: string;
    },
  ) {
    super(message);
    this.name = "LarkTicketAiSessionError";
  }
}

export interface LarkTicketAiSessionServiceDeps {
  syncStore?: PlatformSyncStore;
  ownershipStore?: AcpKimiSessionOwnershipStore;
  acpService?: Pick<AcpKimiProxyService, "assertSessionAccess" | "chat">;
  historyService?: Pick<typeof acpKimiSessionHistoryService, "loadSession">;
  workflowPromptStore?: WorkflowPromptStore;
  threadContextService?: Pick<LarkTicketThreadContextService, "ensure">;
  knowledgeRetriever?: SupportKnowledgeRetriever;
  resolveAction?: (actionKey: string) => Promise<ResolvedTicketAiAction | undefined>;
  ticketSummaryClient?: TicketSummaryJsonCompletionClient;
  analysisService?: Pick<ReturnType<typeof createSupportTicketAnalysisService>, "update">;
}

interface ResolvedTicketAiAction {
  action: KimiTicketAiAutomationActionConfig;
  workspaceDir: string;
  octoServerDir: string;
  skillPath: string;
}

export function createLarkTicketAiSessionService(
  deps: LarkTicketAiSessionServiceDeps = {},
) {
  const getSyncStore = () => deps.syncStore ?? new PostgresPlatformSyncStore();
  const ownershipStore = deps.ownershipStore ?? getAcpKimiSessionOwnershipStore();
  const acpService = deps.acpService ?? acpKimiProxyService;
  const historyService = deps.historyService ?? acpKimiSessionHistoryService;
  const workflowPromptStore = deps.workflowPromptStore ?? getWorkflowPromptStore();
  const threadContextService = deps.threadContextService ?? createLarkTicketThreadContextService();
  const knowledgeRetriever = deps.knowledgeRetriever ?? getSupportKnowledgeStore();
  const resolveAction = deps.resolveAction ?? resolveTicketAiAction;
  const getTicketSummaryClient = () => deps.ticketSummaryClient ?? createTicketSummaryJsonCompletionClient();
  const getAnalysisService = () => deps.analysisService ?? createSupportTicketAnalysisService();

  return {
    async listSessions(input: {
      operatorLarkId: string;
      ticket: LarkTicketAiSessionRef;
    }) {
      await getTicket(getSyncStore(), input.ticket);
      const sessions = await ownershipStore.listByTicket({
        operatorLarkId: input.operatorLarkId,
        ...input.ticket,
      });
      return sessions
        .filter((session) => session.automationActionKey !== LARK_TICKET_SUPPORT_QA_SUMMARIZE_ACTION_KEY)
        .map(toSessionSummary);
    },

    async loadSession(input: {
      operatorLarkId: string;
      ticket: LarkTicketAiSessionRef;
      sessionId: string;
      signal?: AbortSignal;
    }) {
      await getTicketSession(ownershipStore, input);
      return historyService.loadSession({
        operatorLarkId: input.operatorLarkId,
        sessionId: input.sessionId,
        signal: input.signal,
      });
    },

    async chat(input: {
      operatorLarkId: string;
      masterUserId: string;
      larkBaseUrl: string;
      ticket: LarkTicketAiSessionRef;
      message: string;
      sessionId?: string;
      actionKey?: string;
      actionRunId?: string;
      signal?: AbortSignal;
    }, emit: (event: AcpKimiStreamEvent) => void) {
      const ticket = await getTicket(getSyncStore(), input.ticket);
      const requestedAction = !input.sessionId && input.actionKey
        ? getTicketAiAutomationAction(input.actionKey)
        : undefined;
      if (!deps.resolveAction && input.actionKey && !input.sessionId && !requestedAction) {
        throw new LarkTicketAiSessionError("AI_ACTION_NOT_FOUND", "Requested AI quick action is not configured.");
      }
      if (requestedAction?.provider === "ticket_summary") {
        await runTicketSummary({
          ticket,
          input,
          action: requestedAction,
          promptStore: workflowPromptStore,
          threadContextService,
          getTicketSummaryClient,
          analysisService: getAnalysisService(),
          emit,
        });
        return;
      }
      const session = input.sessionId
        ? await getTicketSession(ownershipStore, {
          operatorLarkId: input.operatorLarkId,
          ticket: input.ticket,
          sessionId: input.sessionId,
        })
        : null;
      if (input.sessionId && input.actionKey && session?.automationActionKey !== input.actionKey) {
        throw new LarkTicketAiSessionError("SESSION_FORBIDDEN", "AI Session action cannot be changed after creation.");
      }
      const quickAction = input.sessionId || !input.actionKey
        ? undefined
        : await resolveAction(input.actionKey);
      if (input.actionKey && !quickAction) {
        throw new LarkTicketAiSessionError("AI_ACTION_NOT_FOUND", "Requested AI quick action is not configured.");
      }
      const actionRunId = input.actionRunId ?? (quickAction ? randomUUID() : undefined);
      const permissionContext = quickAction
        ? createPermissionContext(quickAction, ticket, actionRunId)
        : undefined;
      let threadContext: LarkTicketThreadContextResult | undefined;
      if (!input.sessionId) {
        try {
          threadContext = await threadContextService.ensure({
            masterUserId: input.masterUserId,
            larkBaseUrl: input.larkBaseUrl,
            ticket,
          });
        } catch (error) {
          if (error instanceof LarkTicketThreadContextError) {
            throw new LarkTicketAiSessionError(error.code, error.message);
          }
          throw error;
        }
      }
      const knowledgeEvidence = quickAction?.action.key === "lark-ticket-support-qa-answer"
        ? await knowledgeRetriever.searchApproved({
          query: buildKnowledgeQuery(ticket, input.message),
          limit: 5,
        })
        : [];
      const prompt = quickAction
        ? await buildQuickActionPrompt(workflowPromptStore, quickAction, ticket, input.message, threadContext, knowledgeEvidence)
        : input.sessionId ? input.message : buildTicketPrompt(ticket, input.message, threadContext);
      let createdSessionId: string | undefined;
      let attachmentPromise: Promise<void> | undefined;
      let doneEvent: Extract<AcpKimiStreamEvent, { event: "done" }> | undefined;
      let assistantOutput = "";
      const evidenceTracker = quickAction && permissionContext
        ? createSupportQaEvidenceTracker(permissionContext)
        : undefined;

      try {
        await acpService.chat({
          operatorLarkId: input.operatorLarkId,
          sessionId: input.sessionId,
          actionRunId,
          message: prompt,
          permissionContext,
        }, (event) => {
          if (event.event === "session.created") {
            createdSessionId = event.data.sessionId;
            attachmentPromise = attachCreatedTicketSession({
              ownershipStore,
              sessionId: createdSessionId,
              operatorLarkId: input.operatorLarkId,
              title: deriveSessionTitle(input.message),
              ticket: input.ticket,
              ticketNumber: ticket.ticketNumber || ticket.recordId,
              snapshot: threadContext?.snapshot,
            });
          }
          assistantOutput = appendAssistantOutput(assistantOutput, event);
          evidenceTracker?.observe(event);
          if (event.event === "done" && evidenceTracker) {
            doneEvent = event;
            return;
          }
          emit(event);
        }, {
          signal: input.signal,
          session: input.sessionId ? undefined : null,
        });
      } catch (error) {
        await attachmentPromise;
        throw error;
      }

      await attachmentPromise;

      const sessionId = input.sessionId ?? createdSessionId;
      if (!sessionId) {
        throw new LarkTicketAiSessionError("SESSION_NOT_FOUND", "Kimi ACP did not return a session id.");
      }

      if (!createdSessionId) {
        await ownershipStore.touch(sessionId, input.operatorLarkId);
      }

      if (evidenceTracker && !evidenceTracker.fetchCompleted) {
        await ownershipStore.updateRun?.({
          sessionId,
          operatorLarkId: input.operatorLarkId,
          actionRunId: actionRunId!,
          status: "failed",
          errorCode: "SUPPORT_QA_EVIDENCE_NOT_FETCHED",
          errorMessage: "Support-QA evidence fetch did not complete; the AI result was not accepted.",
          unverifiedOutput: assistantOutput || null,
        });
        throw new LarkTicketAiSessionError(
          "SUPPORT_QA_EVIDENCE_NOT_FETCHED",
          "Support-QA evidence fetch did not complete; the AI result was not accepted.",
          {
            layer: "server",
            module: "lark-ticket-ai-session",
            stage: "server.workflow.completed",
            ...(actionRunId ? { actionRunId } : {}),
          },
        );
      }
      if (doneEvent) {
        emit(doneEvent);
      }
      if (quickAction && actionRunId) {
        await ownershipStore.updateRun?.({
          sessionId,
          operatorLarkId: input.operatorLarkId,
          actionRunId,
          status: "completed",
        });
      }
    },
  };
}

async function runTicketSummary(input: {
  ticket: LarkBaseTicketSyncItem;
  input: {
    masterUserId: string;
    larkBaseUrl: string;
    ticket: LarkTicketAiSessionRef;
    message: string;
    actionRunId?: string;
    signal?: AbortSignal;
  };
  action: TicketSummaryTicketAiAutomationActionConfig;
  promptStore: WorkflowPromptStore;
  threadContextService: Pick<LarkTicketThreadContextService, "ensure">;
  getTicketSummaryClient: () => TicketSummaryJsonCompletionClient;
  analysisService: Pick<ReturnType<typeof createSupportTicketAnalysisService>, "update">;
  emit: (event: AcpKimiStreamEvent) => void;
}): Promise<void> {
  const actionRunId = input.input.actionRunId ?? randomUUID();
  let threadContext: LarkTicketThreadContextResult;
  try {
    threadContext = await input.threadContextService.ensure({
      masterUserId: input.input.masterUserId,
      larkBaseUrl: input.input.larkBaseUrl,
      ticket: input.ticket,
    });
  } catch (error) {
    if (error instanceof LarkTicketThreadContextError) {
      throw new LarkTicketAiSessionError(error.code, error.message, {
        layer: "server",
        module: "lark-ticket-ai-session",
        stage: "server.thread.snapshot",
        actionRunId,
      });
    }
    throw error;
  }
  const snapshot = threadContext.snapshot;
  if (!snapshot || snapshot.preparedMessages.length === 0) {
    throw new LarkTicketAiSessionError(
      "LARK_THREAD_CONTEXT_UNAVAILABLE",
      "Ticket summary requires a fixed Ticket snapshot with at least one evidence message.",
      { layer: "server", module: "lark-ticket-ai-session", stage: "server.thread.snapshot", actionRunId },
    );
  }
  const promptRecord = await input.promptStore.getByKey(input.action.promptKey);
  const template = promptRecord?.prompt.trim()
    || DEFAULT_LARK_TICKET_SUPPORT_QA_PROMPTS[input.action.promptKey];
  if (!template) {
    throw new LarkTicketAiSessionError("AI_ACTION_NOT_FOUND", `Prompt ${input.action.promptKey} is not configured.`);
  }
  const prompt = renderWorkflowPromptTemplate(template, {
    ticket_context: buildTicketSummaryContext(input.ticket, threadContext),
    user_message: input.input.message,
  });
  let completion: Awaited<ReturnType<TicketSummaryJsonCompletionClient["createJsonCompletion"]>>;
  try {
    completion = await input.getTicketSummaryClient().createJsonCompletion({
      prompt,
      actionRunId,
      signal: input.input.signal,
    });
  } catch (error) {
    if (isTicketSummaryClientError(error)) {
      throw new LarkTicketAiSessionError(error.code, error.message, {
        layer: "adapter",
        module: error.name === "ZcodeChatError" ? "zcode-chat-client" : "ticket-summary-client",
        stage: error.code === "DEEPSEEK_TIMEOUT" || error.code === "ZCODE_TIMEOUT"
          ? "adapter.ticket_summary.timeout"
          : error.code === "TICKET_SUMMARY_PROVIDER_INVALID"
            ? "adapter.ticket_summary.config"
            : "adapter.ticket_summary.response",
        actionRunId,
      });
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(completion.content);
  } catch {
    throw new LarkTicketAiSessionError(
      "TICKET_SUMMARY_OUTPUT_INVALID",
      "Ticket summary output was not valid JSON.",
      { layer: "server", module: "lark-ticket-ai-session", stage: "server.ticket_summary.parse", actionRunId },
    );
  }
  const analysisResult = supportAnalysisResultSchema.safeParse(parsed);
  if (!analysisResult.success) {
    throw new LarkTicketAiSessionError(
      "TICKET_SUMMARY_OUTPUT_INVALID",
      `Ticket summary output failed analysis schema validation: ${analysisResult.error.issues.map((issue) => issue.path.join(".") || issue.code).join(", ").slice(0, 300)}`,
      { layer: "server", module: "lark-ticket-ai-session", stage: "server.ticket_summary.validate", actionRunId },
    );
  }
  const knownEvidenceIds = new Set(snapshot.preparedMessages.map((message) => message.messageId));
  if (analysisResult.data.analysis.intent.evidenceMessageIds.some((id) => !knownEvidenceIds.has(id))) {
    throw new LarkTicketAiSessionError(
      "TICKET_SUMMARY_EVIDENCE_OUTSIDE_SNAPSHOT",
      "Ticket summary analysis referenced evidence outside the fixed Ticket snapshot.",
      { layer: "server", module: "lark-ticket-ai-session", stage: "server.ticket_summary.evidence", actionRunId },
    );
  }
  try {
    await input.analysisService.update({
      ticket: input.input.ticket,
      snapshotVersion: snapshot.snapshotVersion,
      actionRunId,
      sourceName: "lark-ticket-support-qa-summarize",
      reviewStatus: "ai_generated",
      reviewerKind: "ai",
      analysis: analysisResult.data.analysis,
    });
  } catch (error) {
    if (error instanceof SupportTicketAnalysisError) {
      const code = error.code === "THREAD_SNAPSHOT_VERSION_CONFLICT"
        ? "THREAD_SNAPSHOT_VERSION_CONFLICT"
        : error.code === "INVALID_EVIDENCE_MESSAGE_IDS"
          ? "TICKET_SUMMARY_EVIDENCE_OUTSIDE_SNAPSHOT"
          : error.code === "LARK_TICKET_NOT_FOUND"
            ? "LARK_TICKET_NOT_FOUND"
            : "LARK_THREAD_CONTEXT_UNAVAILABLE";
      throw new LarkTicketAiSessionError(code, error.message, {
        layer: "server",
        module: "support-ticket-analysis",
        stage: "server.analysis.update",
        actionRunId,
      });
    }
    throw error;
  }
  const streamId = `ticket-summary-${actionRunId}`;
  input.emit({
    event: "acp.session.update",
    data: {
      sessionId: streamId,
      update: {
        sessionUpdate: "agent_message_chunk",
        messageId: streamId,
        content: { type: "text", text: analysisResult.data.summary },
      },
    },
  });
  input.emit({ event: "done", data: { sessionId: streamId, stopReason: "end_turn" } });
}

function buildTicketSummaryContext(
  ticket: LarkBaseTicketSyncItem,
  threadContext: LarkTicketThreadContextResult,
): string {
  return [
    `Type: ${ticket.issueType || "Lark Ticket"}`,
    `Number: ${ticket.ticketNumber || ticket.recordId}`,
    `Title: ${redactSupportText(ticket.title)}`,
    `Description:\n${redactSupportText(ticket.detailDescription) || "(none)"}`,
    `Fixed snapshot version: ${threadContext.snapshot?.snapshotVersion ?? "none"}`,
    `Allowed evidence Message IDs: ${(threadContext.snapshot?.preparedMessages ?? []).map((message) => message.messageId).join(", ") || "(none)"}`,
    `Lark thread context:\n${formatThreadContext(threadContext)}`,
  ].join("\n\n");
}

async function attachCreatedTicketSession(input: {
  ownershipStore: AcpKimiSessionOwnershipStore;
  sessionId: string;
  operatorLarkId: string;
  title: string;
  ticket: LarkTicketAiSessionRef;
  ticketNumber: string;
  snapshot?: LarkTicketThreadContextResult["snapshot"];
}): Promise<void> {
  const claimed = await input.ownershipStore.attachTicket({
    sessionId: input.sessionId,
    operatorLarkId: input.operatorLarkId,
    title: input.title,
    ...input.ticket,
    ticketNumber: input.ticketNumber,
    ...(input.snapshot ? {
      threadId: input.snapshot.threadId,
      threadSnapshotVersion: input.snapshot.snapshotVersion,
      threadContextSyncedAt: input.snapshot.lastSuccessfulSyncAt ?? input.snapshot.updatedAt,
    } : {}),
  });
  if (!claimed) {
    throw new LarkTicketAiSessionError("SESSION_NOT_FOUND", "Created AI session could not be associated with this Ticket.");
  }
}

function createSupportQaEvidenceTracker(context: AcpKimiPermissionContext) {
  const toolCallIds = new Set<string>();
  const conflictingToolCallIds = new Set<string>();
  let fetchCompleted = false;
  return {
    get fetchCompleted() {
      return fetchCompleted;
    },
    observe(event: AcpKimiStreamEvent) {
      if (event.event !== "acp.session.update") {
        return;
      }
      const update = event.data.update;
      const toolCallId = typeof update.toolCallId === "string"
        ? update.toolCallId
        : undefined;
      if (!toolCallId) {
        return;
      }
      if ((update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update")
        && update.rawInput !== undefined && update.rawInput !== null) {
        const command = extractAcpKimiRawCommand(update.rawInput);
        const executeCall = extractAcpKimiExecuteCall(update.rawInput);
        const isFetch = executeCall && isAcpKimiSupportQaFetchExecuteCall(executeCall, context)
          || command && isAcpKimiSupportQaFetchCommand(command, context);
        if (isFetch) {
          if (!conflictingToolCallIds.has(toolCallId)) {
            toolCallIds.add(toolCallId);
          }
        } else if (toolCallIds.has(toolCallId)) {
          toolCallIds.delete(toolCallId);
          conflictingToolCallIds.add(toolCallId);
        }
      }
      if (update.sessionUpdate === "tool_call") {
        return;
      }
      if (update.sessionUpdate !== "tool_call_update"
        || (update.status !== "completed" && update.status !== "failed")) {
        return;
      }
      if (update.status === "completed" && toolCallIds.has(toolCallId)) {
        fetchCompleted = true;
      }
      toolCallIds.delete(toolCallId);
      conflictingToolCallIds.delete(toolCallId);
    },
  };
}

async function getTicket(
  syncStore: PlatformSyncStore,
  ticket: LarkTicketAiSessionRef,
): Promise<LarkBaseTicketSyncItem> {
  const [record] = await syncStore.getLarkBaseTicketsForCleaning([ticket]);
  if (!record) {
    throw new LarkTicketAiSessionError("LARK_TICKET_NOT_FOUND", "The requested Lark Ticket is not available in the synchronized snapshot.");
  }
  return record;
}

async function getTicketSession(
  ownershipStore: AcpKimiSessionOwnershipStore,
  input: {
    operatorLarkId: string;
    ticket: LarkTicketAiSessionRef;
    sessionId: string;
  },
) {
  const session = await ownershipStore.getBySessionId(input.sessionId);
  if (!session || session.deletedAt) {
    throw new LarkTicketAiSessionError("SESSION_NOT_FOUND", "AI Session was not found.");
  }
  if (session.operatorLarkId !== input.operatorLarkId
    || session.ticketBaseId !== input.ticket.baseId
    || session.ticketTableId !== input.ticket.tableId
    || session.ticketRecordId !== input.ticket.recordId) {
    throw new LarkTicketAiSessionError("SESSION_FORBIDDEN", "AI Session does not belong to this Ticket.");
  }
  if (session.automationActionKey === LARK_TICKET_SUPPORT_QA_SUMMARIZE_ACTION_KEY) {
    throw new LarkTicketAiSessionError("SESSION_NOT_FOUND", "Ticket Summary is a one-shot result and has no resumable AI Session.");
  }
  return session;
}

function toSessionSummary(session: AcpKimiSessionOwnershipRecord) {
  return {
    sessionId: session.sessionId,
    title: session.title || session.sessionId,
    updatedAt: session.updatedAt,
    ...(session.automationActionKey ? { actionKey: session.automationActionKey } : {}),
    ...(session.actionRunId ? { actionRunId: session.actionRunId } : {}),
    ...(session.runStatus ? { runStatus: session.runStatus } : {}),
    ...(session.runErrorCode ? { errorCode: session.runErrorCode } : {}),
    ...(session.runErrorMessage ? { errorMessage: session.runErrorMessage } : {}),
    ...(session.unverifiedOutput ? { hasUnverifiedOutput: true } : {}),
  };
}

function appendAssistantOutput(current: string, event: AcpKimiStreamEvent): string {
  if (event.event !== "acp.session.update") return current;
  const update = event.data.update;
  if (update.sessionUpdate !== "agent_message_chunk") return current;
  const content = update.content;
  const chunk = typeof content === "string"
    ? content
    : content && typeof content === "object" && "text" in content && typeof content.text === "string"
      ? content.text
      : "";
  return `${current}${chunk}`.slice(-32_000);
}

function deriveSessionTitle(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length > 56 ? `${normalized.slice(0, 56)}…` : normalized;
}

function formatThreadContext(context: LarkTicketThreadContextResult | undefined): string {
  const snapshot = context?.snapshot;
  if (!snapshot) return "(none)";
  const rendered = (snapshot.preparedMessages ?? prepareTicketThread(snapshot.messages)).map((message, index) => [
    `Message ${index + 1} (${message.messageId})`,
    message.createdAt && `Time: ${message.createdAt}`,
    `Sender role: ${message.senderRole}`,
    message.replyTo && `Reply to: ${message.replyTo}`,
    message.text,
  ].filter(Boolean).join("\n")).join("\n\n");
  const maxChars = 60_000;
  if (rendered.length <= maxChars) return rendered || "(empty thread)";
  const headChars = 10_000;
  return `${rendered.slice(0, headChars)}\n\n[older middle messages truncated for AI input]\n\n${rendered.slice(-(maxChars - headChars))}`;
}

function buildTicketPrompt(
  ticket: LarkBaseTicketSyncItem,
  request: string,
  threadContext?: LarkTicketThreadContextResult,
): string {
  const resources = [
    ticket.sharedUrl && `Lark Base: ${ticket.sharedUrl}`,
    ticket.larkMessageLink && `Lark message: ${ticket.larkMessageLink}`,
    ticket.meegleLink && `Meegle: ${ticket.meegleLink}`,
  ].filter(Boolean).join("\n");
  return [
    "You are assisting with a Lark Ticket. Use the following ticket context, state assumptions clearly, and do not claim to have changed external systems unless a tool confirms it.",
    `Type: ${ticket.issueType || "Lark Ticket"}`,
    `Number: ${ticket.ticketNumber || ticket.recordId}`,
    `Title: ${redactSupportText(ticket.title)}`,
    `Description:\n${redactSupportText(ticket.detailDescription) || "(none)"}`,
    `Resources:\n${resources || "(none)"}`,
    `Lark thread context (snapshot version ${threadContext?.snapshot?.snapshotVersion ?? "none"}):\n${formatThreadContext(threadContext)}`,
    `User request:\n${request}`,
  ].join("\n\n");
}

async function resolveTicketAiAction(actionKey: string): Promise<ResolvedTicketAiAction | undefined> {
  const action = getTicketAiAutomationAction(actionKey);
  if (!action || action.provider !== "kimi_acp") {
    return undefined;
  }
  const profile = AUTOMATION_SKILL_PROFILES[action.skillProfile];
  const workspaceDir = process.env[profile.workspaceEnv]?.trim();
  const octoServerDir = process.env.OCTO_SERVER_DIR?.trim();
  const skillRelativePath = (profile.skills as Record<string, string>)[action.skillId];
  if (!workspaceDir || !octoServerDir || !skillRelativePath) {
    throw new LarkTicketAiSessionError("SKILL_PROFILE_NOT_CONFIGURED", `Skill profile ${action.skillProfile} is not configured on this server.`);
  }
  const resolvedWorkspace = await realpath(workspaceDir);
  const resolvedOctoServer = await realpath(octoServerDir);
  const skillPath = await realpath(resolve(resolvedWorkspace, skillRelativePath));
  const pathFromWorkspace = relative(resolvedWorkspace, skillPath);
  if (!pathFromWorkspace
    || pathFromWorkspace === ".."
    || pathFromWorkspace.startsWith("../")
    || pathFromWorkspace.startsWith("..\\")) {
    throw new LarkTicketAiSessionError("SKILL_PROFILE_NOT_CONFIGURED", `Skill profile ${action.skillProfile} resolves outside its workspace.`);
  }
  await access(skillPath, constants.R_OK);
  return { action, workspaceDir: resolvedWorkspace, octoServerDir: resolvedOctoServer, skillPath };
}

function createPermissionContext(
  quickAction: ResolvedTicketAiAction,
  ticket: LarkBaseTicketSyncItem,
  actionRunId?: string,
): AcpKimiPermissionContext {
  return {
    actionKey: quickAction.action.key,
    executionPolicy: quickAction.action.executionPolicy,
    workspaceDir: quickAction.workspaceDir,
    octoServerDir: quickAction.octoServerDir,
    skillProfile: quickAction.action.skillProfile,
    skillId: quickAction.action.skillId,
    ticketNumber: ticket.ticketNumber || ticket.recordId,
    ticketRecordId: ticket.recordId,
    actionRunId,
    policyVersion: "v4-temporary-support-qa-bash",
  };
}

async function buildQuickActionPrompt(
  promptStore: WorkflowPromptStore,
  quickAction: ResolvedTicketAiAction,
  ticket: LarkBaseTicketSyncItem,
  message: string,
  threadContext?: LarkTicketThreadContextResult,
  knowledgeEvidence: SupportKnowledgeSearchHit[] = [],
): Promise<string> {
  const storedPrompt = await promptStore.getByKey(quickAction.action.promptKey);
  const template = storedPrompt?.prompt.trim()
    || DEFAULT_LARK_TICKET_SUPPORT_QA_PROMPTS[quickAction.action.promptKey];
  if (!template) {
    throw new LarkTicketAiSessionError("AI_ACTION_NOT_FOUND", `Prompt ${quickAction.action.promptKey} is not configured.`);
  }
  const prompt = renderWorkflowPromptTemplate(template, {
    skill_path: quickAction.skillPath,
    ticket_context: [
      buildTicketPrompt(ticket, "", threadContext).replace(/\n\nUser request:\n$/, ""),
      formatKnowledgeEvidence(knowledgeEvidence),
    ].join("\n\n"),
    knowledge_evidence: formatKnowledgeEvidence(knowledgeEvidence),
    user_message: message,
  });
  return `${prompt}\n\n${buildSupportQaFetchInstruction(ticket.ticketNumber || ticket.recordId)}`;
}

function buildKnowledgeQuery(ticket: LarkBaseTicketSyncItem, message: string): string {
  return [ticket.title, ticket.issueType, ticket.detailDescription, message]
    .map(redactSupportText)
    .filter(Boolean)
    .join("\n");
}

function formatKnowledgeEvidence(hits: SupportKnowledgeSearchHit[]): string {
  if (!hits.length) {
    return "Approved internal knowledge evidence: (none found; do not invent a document or historical case citation).";
  }
  return ["Approved internal knowledge evidence (cite source_ref; do not treat it as a platform write):", ...hits.map((hit, index) => [
    `[${index + 1}] kind=${hit.sourceKind}`,
    `source_ref=${hit.sourceRef}`,
    `title=${hit.title}`,
    `approved_at=${hit.approvedAt}`,
    `content=${hit.redactedContent}`,
  ].join("\n"))].join("\n\n");
}
