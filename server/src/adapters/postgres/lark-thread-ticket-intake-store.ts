import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { DatabaseSchema } from "./schema.js";

export type LarkThreadTicketIntake = Selectable<DatabaseSchema["lark_thread_ticket_intakes"]>;
export type IntakeStage = "pending" | "creating" | "created" | "analyzed" | "titled" | "replying" | "replied" | "done" | "existing" | "outcome_unknown";

export class PostgresLarkThreadTicketIntakeStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async get(sourceKey: string, threadId: string): Promise<LarkThreadTicketIntake | undefined> {
    return this.db.selectFrom("lark_thread_ticket_intakes").selectAll()
      .where("source_key", "=", sourceKey).where("thread_id", "=", threadId).executeTakeFirst();
  }

  async initializeScan(sourceKey: string, startAt: string): Promise<{ watermark: string; startedAt: string }> {
    await this.db.insertInto("lark_thread_ticket_scans").values({
      source_key: sourceKey, started_at: startAt, watermark: startAt, updated_at: new Date().toISOString(),
    }).onConflict((c) => c.column("source_key").doNothing()).execute();
    const row = await this.db.selectFrom("lark_thread_ticket_scans").select(["watermark", "started_at"])
      .where("source_key", "=", sourceKey).executeTakeFirstOrThrow();
    return { watermark: row.watermark, startedAt: row.started_at };
  }

  async advanceScan(sourceKey: string, watermark: string): Promise<void> {
    await this.db.updateTable("lark_thread_ticket_scans").set({ watermark, updated_at: new Date().toISOString() })
      .where("source_key", "=", sourceKey).where("watermark", "<=", watermark).execute();
  }

  async enqueue(sourceKey: string, threadId: string, rootMessageId: string, messageLink?: string): Promise<LarkThreadTicketIntake> {
    const now = new Date().toISOString();
    await this.db.insertInto("lark_thread_ticket_intakes").values({
      source_key: sourceKey, thread_id: threadId, root_message_id: rootMessageId, message_link: messageLink ?? null,
      action_run_id: randomUUID(), stage: "pending", record_id: null, title: null,
      reply_message_id: null, error_code: null, attempts: 0, created_at: now, updated_at: now,
    }).onConflict((c) => c.columns(["source_key", "thread_id"]).doNothing()).execute();
    if (messageLink) {
      await this.db.updateTable("lark_thread_ticket_intakes").set({ message_link: messageLink })
        .where("source_key", "=", sourceKey).where("thread_id", "=", threadId).where("message_link", "is", null).execute();
    }
    return this.db.selectFrom("lark_thread_ticket_intakes").selectAll()
      .where("source_key", "=", sourceKey).where("thread_id", "=", threadId).executeTakeFirstOrThrow();
  }

  async listPending(sourceKey: string, limit: number): Promise<LarkThreadTicketIntake[]> {
    return this.db.selectFrom("lark_thread_ticket_intakes").selectAll()
      .where("source_key", "=", sourceKey).where("stage", "not in", ["done", "existing", "outcome_unknown"])
      .where("attempts", "<", 5)
      .orderBy("updated_at").orderBy("thread_id").limit(limit).execute();
  }

  async advance(run: LarkThreadTicketIntake, stage: IntakeStage, fields: Partial<Pick<LarkThreadTicketIntake,
    "record_id" | "title" | "reply_message_id" | "error_code" | "attempts"
  >> = {}): Promise<LarkThreadTicketIntake> {
    const row = await this.db.updateTable("lark_thread_ticket_intakes")
      .set({ attempts: 0, ...fields, stage, error_code: fields.error_code ?? null, updated_at: new Date().toISOString() })
      .where("source_key", "=", run.source_key).where("thread_id", "=", run.thread_id)
      .where("stage", "=", run.stage).returningAll().executeTakeFirst();
    if (!row) throw new Error("LARK_THREAD_TICKET_STAGE_CONFLICT");
    return row;
  }

  async recordFailure(run: LarkThreadTicketIntake, errorCode: string, retryStage?: "pending" | "titled"): Promise<LarkThreadTicketIntake> {
    const row = await this.db.updateTable("lark_thread_ticket_intakes")
      .set({ stage: retryStage ?? run.stage, error_code: errorCode, attempts: run.attempts + 1, updated_at: new Date().toISOString() })
      .where("source_key", "=", run.source_key).where("thread_id", "=", run.thread_id)
      .where("stage", "=", run.stage).returningAll().executeTakeFirst();
    if (!row) throw new Error("LARK_THREAD_TICKET_STAGE_CONFLICT");
    return row;
  }
}
