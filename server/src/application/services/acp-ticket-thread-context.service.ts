import {
  PostgresPlatformSyncStore,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";
import {
  createLarkTicketThreadContextService,
  type LarkTicketThreadContextService,
} from "./lark-ticket-thread-context.service.js";

export class AcpTicketThreadContextError extends Error {
  constructor(
    readonly code: "LARK_TICKET_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AcpTicketThreadContextError";
  }
}

export function createAcpTicketThreadContextService(deps: {
  syncStore?: PlatformSyncStore;
  threadContextService?: Pick<LarkTicketThreadContextService, "ensure">;
} = {}) {
  const syncStore = deps.syncStore ?? new PostgresPlatformSyncStore();
  const threadContextService = deps.threadContextService ?? createLarkTicketThreadContextService();

  return {
    async getMessages(input: {
      masterUserId: string;
      larkBaseUrl: string;
      ticket: { baseId: string; tableId: string; recordId: string };
    }) {
      const [ticket] = await syncStore.getLarkBaseTicketsForCleaning([input.ticket]);
      if (!ticket) {
        throw new AcpTicketThreadContextError(
          "LARK_TICKET_NOT_FOUND",
          "The requested Lark Ticket is not available in the synchronized snapshot.",
        );
      }
      const ensured = await threadContextService.ensure({
        masterUserId: input.masterUserId,
        larkBaseUrl: input.larkBaseUrl,
        ticket,
      });
      return {
        schemaVersion: 1 as const,
        ticket: input.ticket,
        ticketStatus: ticket.ticketStatus,
        decision: ensured.decision,
        source: ensured.source,
        threadId: ensured.threadId,
        snapshotVersion: ensured.snapshot?.snapshotVersion,
        historyComplete: ensured.snapshot?.historyComplete ?? false,
        frozenAt: ensured.snapshot?.frozenAt,
        frozenStatus: ensured.snapshot?.frozenStatus,
        syncedAt: ensured.snapshot?.lastSuccessfulSyncAt,
        messages: ensured.snapshot?.messages ?? [],
      };
    },
  };
}

export type AcpTicketThreadContextService = ReturnType<typeof createAcpTicketThreadContextService>;
