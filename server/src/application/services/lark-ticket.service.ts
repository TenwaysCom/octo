import type { LarkClient } from "../../adapters/lark/lark-client.js";
import {
  PostgresPlatformSyncStore,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";
import {
  buildAuthenticatedLarkClient,
  type AuthenticatedLarkClientFactoryDeps,
} from "./lark-auth-client.factory.js";

export interface LarkTicketRef {
  baseId: string;
  tableId: string;
  recordId: string;
}

export class LarkTicketError extends Error {
  constructor(
    readonly code: "LARK_TICKET_NOT_FOUND" | "LARK_TICKET_SHARED_URL_NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export interface LarkTicketServiceDeps extends AuthenticatedLarkClientFactoryDeps {
  syncStore?: Pick<PlatformSyncStore, "getLarkBaseTicketsForCleaning" | "setLarkBaseTicketSharedUrl">;
  createLarkClient?: (accessToken: string, baseUrl?: string) => LarkClient;
}

export function createLarkTicketService(
  deps: LarkTicketServiceDeps = {},
) {
  const getSyncStore = () => deps.syncStore ?? new PostgresPlatformSyncStore();

  return {
    async loadSharedUrl(input: {
      masterUserId: string;
      larkBaseUrl: string;
      ticket: LarkTicketRef;
    }): Promise<{ sharedUrl: string }> {
      const syncStore = getSyncStore();
      const [ticket] = await syncStore.getLarkBaseTicketsForCleaning([input.ticket]);
      if (!ticket) {
        throw new LarkTicketError("LARK_TICKET_NOT_FOUND", "The requested Lark Ticket is not available in the synchronized snapshot.");
      }
      if (ticket.sharedUrl) {
        return { sharedUrl: ticket.sharedUrl };
      }

      const { client } = await buildAuthenticatedLarkClient(
        input.masterUserId,
        input.larkBaseUrl,
        deps,
      );
      const result = await client.batchGetRecords(
        input.ticket.baseId,
        input.ticket.tableId,
        [input.ticket.recordId],
        { withSharedUrl: true },
      );
      const sharedUrl = result.records.find((record) => record.record_id === input.ticket.recordId)?.shared_url;
      if (!sharedUrl) {
        throw new LarkTicketError("LARK_TICKET_SHARED_URL_NOT_FOUND", "Lark did not return a shared URL for this Ticket.");
      }

      await syncStore.setLarkBaseTicketSharedUrl({ ...input.ticket, sharedUrl });
      return { sharedUrl };
    },
  };
}
