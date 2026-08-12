import type { AcpKimiProxyService } from "./acp-kimi-proxy.service.js";
import { acpKimiProxyService } from "./acp-kimi-proxy.service.js";
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

export interface LarkTicketAiSessionRef {
  baseId: string;
  tableId: string;
  recordId: string;
}

export class LarkTicketAiSessionError extends Error {
  constructor(
    readonly code: "LARK_TICKET_NOT_FOUND" | "SESSION_NOT_FOUND" | "SESSION_FORBIDDEN",
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
}

export function createLarkTicketAiSessionService(
  deps: LarkTicketAiSessionServiceDeps = {},
) {
  const getSyncStore = () => deps.syncStore ?? new PostgresPlatformSyncStore();
  const ownershipStore = deps.ownershipStore ?? getAcpKimiSessionOwnershipStore();
  const acpService = deps.acpService ?? acpKimiProxyService;
  const historyService = deps.historyService ?? acpKimiSessionHistoryService;

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
      ticket: LarkTicketAiSessionRef;
      message: string;
      sessionId?: string;
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
      let createdSessionId: string | undefined;

      await acpService.chat({
        operatorLarkId: input.operatorLarkId,
        sessionId: input.sessionId,
        actionRunId: input.actionRunId,
        message: input.sessionId ? input.message : buildTicketPrompt(ticket, input.message),
      }, (event) => {
        if (event.event === "session.created") {
          createdSessionId = event.data.sessionId;
        }
        emit(event);
      }, {
        signal: input.signal,
        session,
      });

      const sessionId = input.sessionId ?? createdSessionId;
      if (!sessionId) {
        throw new LarkTicketAiSessionError("SESSION_NOT_FOUND", "Kimi ACP did not return a session id.");
      }

      if (createdSessionId) {
        const claimed = await ownershipStore.attachTicket({
          sessionId,
          operatorLarkId: input.operatorLarkId,
          title: deriveSessionTitle(input.message),
          ...input.ticket,
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
  return undefined;
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

function buildTicketPrompt(ticket: LarkBaseTicketSyncItem, request: string): string {
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
    `User request:\n${request}`,
  ].join("\n\n");
}
