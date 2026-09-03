import { createHash, randomUUID } from "node:crypto";
import { buildAuthenticatedLarkClient } from "./lark-auth-client.factory.js";
import { getAcpKimiSessionOwnershipStore, type AcpKimiSessionOwnershipStore } from "../../adapters/postgres/acp-kimi-session-ownership-store.js";
import { PostgresLarkTicketThreadSyncStore } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import { getSharedDatabase } from "../../adapters/postgres/database.js";
import { logger } from "../../logger.js";

const replyLogger = logger.child({ module: "support-ticket-reply" });

export class SupportTicketReplyError extends Error {
  constructor(readonly code: "SESSION_FORBIDDEN" | "THREAD_CONTEXT_UNAVAILABLE" | "DRAFT_ALREADY_SENT", message: string) {
    super(message);
  }
}

export function createSupportTicketReplyService(deps: { ownershipStore?: AcpKimiSessionOwnershipStore } = {}) {
  const ownershipStore = deps.ownershipStore ?? getAcpKimiSessionOwnershipStore();
  const threadStore = new PostgresLarkTicketThreadSyncStore();
  return {
    async confirmAndSend(input: {
      operatorLarkId: string; masterUserId: string; larkBaseUrl: string;
      baseId: string; tableId: string; recordId: string; sessionId: string; draft: string; actionRunId?: string;
    }) {
      const ownership = await ownershipStore.getBySessionId(input.sessionId);
      if (!ownership || ownership.operatorLarkId !== input.operatorLarkId
        || ownership.ticketBaseId !== input.baseId || ownership.ticketTableId !== input.tableId
        || ownership.ticketRecordId !== input.recordId
        || ownership.automationActionKey !== "lark-ticket-support-qa-answer") {
        throw new SupportTicketReplyError("SESSION_FORBIDDEN", "Only the current Ticket Answer session can confirm this draft.");
      }
      const snapshot = await threadStore.get({ baseId: input.baseId, tableId: input.tableId, recordId: input.recordId });
      const rootMessageId = snapshot?.messages.find((message) => message.rootId)?.rootId || snapshot?.messages[0]?.messageId;
      if (!rootMessageId) throw new SupportTicketReplyError("THREAD_CONTEXT_UNAVAILABLE", "Ticket thread context is unavailable for a reply.");
      const draftHash = createHash("sha256").update(input.draft).digest("hex");
      const db = getSharedDatabase();
      const existing = await db.selectFrom("support_ticket_reply_drafts").selectAll()
        .where("base_id", "=", input.baseId).where("table_id", "=", input.tableId).where("record_id", "=", input.recordId)
        .where("session_id", "=", input.sessionId).where("draft_hash", "=", draftHash).executeTakeFirst();
      if (existing?.status === "sent") throw new SupportTicketReplyError("DRAFT_ALREADY_SENT", "This confirmed draft was already sent.");
      const now = new Date().toISOString();
      const draftId = existing?.id ?? randomUUID();
      if (!existing) await db.insertInto("support_ticket_reply_drafts").values({
        id: draftId, base_id: input.baseId, table_id: input.tableId, record_id: input.recordId, session_id: input.sessionId,
        operator_lark_id: input.operatorLarkId, draft_hash: draftHash, status: "confirmed", sent_message_id: null,
        action_run_id: input.actionRunId ?? null, created_at: now, updated_at: now,
      }).execute();
      const { client } = await buildAuthenticatedLarkClient(input.masterUserId, input.larkBaseUrl);
      const sent = await client.replyToMessage(rootMessageId, "text", JSON.stringify({ text: input.draft }), { reply_in_thread: true });
      await db.updateTable("support_ticket_reply_drafts").set({ status: "sent", sent_message_id: sent.message_id, updated_at: new Date().toISOString() }).where("id", "=", draftId).execute();
      replyLogger.info({ actionRunId: input.actionRunId, ticketRecordId: input.recordId, draftId }, "SUPPORT_TICKET_REPLY_SENT");
      return { draftId, messageId: sent.message_id };
    },
  };
}
