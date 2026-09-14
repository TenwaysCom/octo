import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { z } from "zod";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export const outgoingMessageSchema = z.object({
  idempotencyKey: z.string().trim().min(1),
  chatId: z.string().trim().min(1),
  text: z.string().min(1),
});
export type OutgoingMessage = z.infer<typeof outgoingMessageSchema>;
export type ClaimedMessage = DatabaseSchema["message_outbox"] & { claim_token: string };
export type MessageOutboxStore = Pick<PostgresMessageOutboxStore, "listDue" | "claim" | "recoverExpired" | "complete">;

/** Delivery envelopes contain no business entities or template rules. */
export class PostgresMessageOutboxStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}
  private get database() { return this.db ?? getSharedDatabase(); }

  async enqueue(input: OutgoingMessage, prior: { attempts?: number; nextAttemptAt?: string | null } = {}): Promise<void> {
    const message = outgoingMessageSchema.parse(input);
    const now = new Date().toISOString();
    await this.database.insertInto("message_outbox").values({
      id: randomUUID(), idempotency_key: message.idempotencyKey, chat_id: message.chatId, text: message.text,
      status: "pending_send", attempts: prior.attempts ?? 0, next_attempt_at: prior.nextAttemptAt ?? null,
      claim_token: null, claim_expires_at: null, message_id: null, error_code: null, created_at: now, updated_at: now,
    }).onConflict((oc) => oc.column("idempotency_key").doNothing()).execute();
  }

  async cancelPending(idempotencyKey: string): Promise<boolean> {
    const result = await this.database.updateTable("message_outbox").set({ status: "cancelled", updated_at: new Date().toISOString() })
      .where("idempotency_key", "=", idempotencyKey).where("status", "=", "pending_send").executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async listDue(maxAttempts: number, limit: number, now: string): Promise<string[]> {
    const rows = await this.database.selectFrom("message_outbox").select("id")
      .where("status", "=", "pending_send").where("attempts", "<", maxAttempts)
      .where((eb) => eb.or([eb("next_attempt_at", "is", null), eb("next_attempt_at", "<=", now)]))
      .orderBy("created_at").limit(limit).execute();
    return rows.map((r) => r.id);
  }

  async claim(id: string, maxAttempts: number, durationMs: number, now: string): Promise<ClaimedMessage | undefined> {
    const row = await this.database.updateTable("message_outbox").set({
      status: "sending", attempts: sql`attempts + 1`, claim_token: randomUUID(),
      claim_expires_at: new Date(Date.parse(now) + durationMs).toISOString(), updated_at: now,
    }).where("id", "=", id).where("status", "=", "pending_send").where("attempts", "<", maxAttempts)
      .where((eb) => eb.or([eb("next_attempt_at", "is", null), eb("next_attempt_at", "<=", now)]))
      .returningAll().executeTakeFirst();
    return row?.claim_token ? { ...row, claim_token: row.claim_token } : undefined;
  }

  async recoverExpired(now: string): Promise<void> {
    await this.database.updateTable("message_outbox").set({
      status: "outcome_unknown", error_code: "MESSAGE_CLAIM_EXPIRED", claim_token: null,
      claim_expires_at: null, next_attempt_at: null, updated_at: now,
    }).where("status", "=", "sending").where("claim_expires_at", "<=", now).execute();
  }

  async complete(message: ClaimedMessage, result: {
    status: "sent" | "failed" | "outcome_unknown" | "pending_send";
    messageId?: string; errorCode?: string; nextAttemptAt?: string;
  }): Promise<void> {
    await this.database.updateTable("message_outbox").set({
      status: result.status, message_id: result.messageId ?? null, error_code: result.errorCode ?? null,
      next_attempt_at: result.nextAttemptAt ?? null, claim_token: null, claim_expires_at: null,
      updated_at: new Date().toISOString(),
    }).where("id", "=", message.id).where("status", "=", "sending")
      .where("claim_token", "=", message.claim_token).execute();
  }
}
