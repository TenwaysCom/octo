import {
  PostgresPlatformSyncStore,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";
import type { LarkTicketAiFields } from "../../domain/lark-ticket-ai.js";

export class LarkTicketAiWriteError extends Error {
  constructor(
    readonly code: "LARK_TICKET_SNAPSHOT_NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export interface LarkTicketAiWriteServiceDeps {
  syncStore?: Pick<PlatformSyncStore, "findLarkBaseTicketByRecordId" | "upsertLarkBaseTicketAi" | "getLarkBaseTicketsForCleaning">;
}

export function createLarkTicketAiWriteService(deps: LarkTicketAiWriteServiceDeps = {}) {
  const getSyncStore = () => deps.syncStore ?? new PostgresPlatformSyncStore();

  return {
    async update(input: { recordId: string; fields: LarkTicketAiFields }) {
      const syncStore = getSyncStore();
      const ticket = await syncStore.findLarkBaseTicketByRecordId(input.recordId);
      if (!ticket) {
        throw new LarkTicketAiWriteError(
          "LARK_TICKET_SNAPSHOT_NOT_FOUND",
          "The requested Lark Ticket is not available in the synchronized snapshot.",
        );
      }
      const updated = await syncStore.upsertLarkBaseTicketAi({ ...ticket, fields: input.fields });
      const [readBack] = await syncStore.getLarkBaseTicketsForCleaning([ticket]);
      const storedFields = readBack?.ticketAi?.fields ?? {};
      const readBackMatches = Object.entries(input.fields).every(([name, value]) =>
        JSON.stringify(storedFields[name]) === JSON.stringify(value));
      if (!updated || !readBackMatches) {
        throw new LarkTicketAiWriteError(
          "LARK_TICKET_SNAPSHOT_NOT_FOUND",
          "Ticket AI update could not be verified by readback.",
        );
      }
      return { recordId: ticket.recordId, updated, storedInOcto: true, readBackVerified: true };
    },
  };
}
