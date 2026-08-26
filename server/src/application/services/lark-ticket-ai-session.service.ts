import type { AcpKimiProxyService } from "./acp-kimi-proxy.service.js";
import { acpKimiProxyService } from "./acp-kimi-proxy.service.js";
import type { AcpKimiPermissionContext } from "./acp-kimi-permission-policy.js";
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
  type TicketAiAutomationActionConfig,
} from "../../modules/public-config/automation-actions.config.js";
import {
  getWorkflowPromptStore,
  type WorkflowPromptStore,
} from "../../adapters/postgres/workflow-prompt-store.js";
import {
  DEFAULT_LARK_TICKET_SUPPORT_QA_PROMPTS,
  renderWorkflowPromptTemplate,
} from "../../domain/workflow-prompts.js";
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

export class LarkTicketAiSessionError extends Error {
  constructor(
    readonly code: "LARK_TICKET_NOT_FOUND" | "SESSION_NOT_FOUND" | "SESSION_FORBIDDEN" | "AI_ACTION_NOT_FOUND" | "SKILL_PROFILE_NOT_CONFIGURED" | "LARK_THREAD_CONTEXT_UNAVAILABLE",
    message: string,
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
  resolveAction?: (actionKey: string) => Promise<ResolvedTicketAiAction | undefined>;
}

interface ResolvedTicketAiAction {
  action: TicketAiAutomationActionConfig;
  workspaceDir: string;
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
  const resolveAction = deps.resolveAction ?? resolveTicketAiAction;

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
      return sessions.map(toSessionSummary);
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
      const permissionContext = quickAction
        ? createPermissionContext(quickAction, ticket)
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
      const prompt = quickAction
        ? await buildQuickActionPrompt(workflowPromptStore, quickAction, ticket, input.message, threadContext)
        : input.sessionId ? input.message : buildTicketPrompt(ticket, input.message, threadContext);
      let createdSessionId: string | undefined;

      await acpService.chat({
        operatorLarkId: input.operatorLarkId,
        sessionId: input.sessionId,
        actionRunId: input.actionRunId,
        message: prompt,
        permissionContext,
      }, (event) => {
        if (event.event === "session.created") {
          createdSessionId = event.data.sessionId;
        }
        emit(event);
      }, {
        signal: input.signal,
        session: input.sessionId ? undefined : null,
      });

      const sessionId = input.sessionId ?? createdSessionId;
      if (!sessionId) {
        throw new LarkTicketAiSessionError("SESSION_NOT_FOUND", "Kimi ACP did not return a session id.");
      }

      if (createdSessionId) {
        const snapshot = threadContext?.snapshot;
        const claimed = await ownershipStore.attachTicket({
          sessionId,
          operatorLarkId: input.operatorLarkId,
          title: deriveSessionTitle(input.message),
          ...input.ticket,
          ticketNumber: ticket.ticketNumber || ticket.recordId,
          ...(snapshot ? {
            threadId: snapshot.threadId,
            threadSnapshotVersion: snapshot.snapshotVersion,
            threadContextSyncedAt: snapshot.lastSuccessfulSyncAt ?? snapshot.updatedAt,
          } : {}),
        });
        if (!claimed) {
          throw new LarkTicketAiSessionError("SESSION_NOT_FOUND", "Created AI session could not be associated with this Ticket.");
        }
      } else {
        await ownershipStore.touch(sessionId, input.operatorLarkId);
      }
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
  return session;
}

function toSessionSummary(session: AcpKimiSessionOwnershipRecord) {
  return {
    sessionId: session.sessionId,
    title: session.title || session.sessionId,
    updatedAt: session.updatedAt,
  };
}

function deriveSessionTitle(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length > 56 ? `${normalized.slice(0, 56)}…` : normalized;
}

function formatThreadContext(context: LarkTicketThreadContextResult | undefined): string {
  const snapshot = context?.snapshot;
  if (!snapshot) return "(none)";
  const rendered = snapshot.messages.map((message, index) => [
    `Message ${index + 1} (${message.messageId})`,
    message.createdAt && `Time: ${message.createdAt}`,
    message.senderId && `Sender: ${message.senderId}`,
    message.deleted ? "[deleted]" : message.content || `[${message.messageType || "unsupported"} message omitted]`,
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
    `Title: ${ticket.title}`,
    `Description:\n${ticket.detailDescription || "(none)"}`,
    `Resources:\n${resources || "(none)"}`,
    `Lark thread context (snapshot version ${threadContext?.snapshot?.snapshotVersion ?? "none"}):\n${formatThreadContext(threadContext)}`,
    `User request:\n${request}`,
  ].join("\n\n");
}

async function resolveTicketAiAction(actionKey: string): Promise<ResolvedTicketAiAction | undefined> {
  const action = getTicketAiAutomationAction(actionKey);
  if (!action) {
    return undefined;
  }
  const profile = AUTOMATION_SKILL_PROFILES[action.skillProfile];
  const workspaceDir = process.env[profile.workspaceEnv]?.trim();
  const skillRelativePath = (profile.skills as Record<string, string>)[action.skillId];
  if (!workspaceDir || !skillRelativePath) {
    throw new LarkTicketAiSessionError("SKILL_PROFILE_NOT_CONFIGURED", `Skill profile ${action.skillProfile} is not configured on this server.`);
  }
  const resolvedWorkspace = await realpath(workspaceDir);
  const skillPath = await realpath(resolve(resolvedWorkspace, skillRelativePath));
  const pathFromWorkspace = relative(resolvedWorkspace, skillPath);
  if (!pathFromWorkspace
    || pathFromWorkspace === ".."
    || pathFromWorkspace.startsWith("../")
    || pathFromWorkspace.startsWith("..\\")) {
    throw new LarkTicketAiSessionError("SKILL_PROFILE_NOT_CONFIGURED", `Skill profile ${action.skillProfile} resolves outside its workspace.`);
  }
  await access(skillPath, constants.R_OK);
  return { action, workspaceDir: resolvedWorkspace, skillPath };
}

function createPermissionContext(
  quickAction: ResolvedTicketAiAction,
  ticket: LarkBaseTicketSyncItem,
): AcpKimiPermissionContext {
  return {
    actionKey: quickAction.action.key,
    executionPolicy: quickAction.action.executionPolicy,
    workspaceDir: quickAction.workspaceDir,
    skillProfile: quickAction.action.skillProfile,
    skillId: quickAction.action.skillId,
    ticketNumber: ticket.ticketNumber || ticket.recordId,
    policyVersion: "v1",
  };
}

async function buildQuickActionPrompt(
  promptStore: WorkflowPromptStore,
  quickAction: ResolvedTicketAiAction,
  ticket: LarkBaseTicketSyncItem,
  message: string,
  threadContext?: LarkTicketThreadContextResult,
): Promise<string> {
  const storedPrompt = await promptStore.getByKey(quickAction.action.promptKey);
  const template = storedPrompt?.prompt.trim()
    || DEFAULT_LARK_TICKET_SUPPORT_QA_PROMPTS[quickAction.action.promptKey];
  if (!template) {
    throw new LarkTicketAiSessionError("AI_ACTION_NOT_FOUND", `Prompt ${quickAction.action.promptKey} is not configured.`);
  }
  return renderWorkflowPromptTemplate(template, {
    skill_path: quickAction.skillPath,
    ticket_context: buildTicketPrompt(ticket, "", threadContext).replace(/\n\nUser request:\n$/, ""),
    user_message: message,
  });
}
