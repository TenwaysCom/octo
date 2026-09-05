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
  syncStore?: Pick<PlatformSyncStore, "findLarkBaseTicketByRecordId" | "upsertLarkBaseTicketAi">;
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
      return { recordId: ticket.recordId, updated, storedInOcto: updated };
    },
  };
}
