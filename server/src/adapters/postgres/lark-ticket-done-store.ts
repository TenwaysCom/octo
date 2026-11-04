import { createHash, randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { DatabaseSchema } from "./schema.js";

export type DoneJob = Selectable<DatabaseSchema["lark_ticket_done_reactions"]>;
export class PostgresLarkTicketDoneStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async initializeScan(sourceKey: string, now: string) {
    await this.db.insertInto("lark_ticket_done_scans").values({
      source_key: sourceKey, enabled_at: now, watermark: now, updated_at: now,
    }).onConflict((c) => c.column("source_key").doNothing()).execute();
    return this.db.selectFrom("lark_ticket_done_scans").selectAll().where("source_key", "=", sourceKey).executeTakeFirstOrThrow();
  }

  async advanceScan(sourceKey: string, watermark: string) {
    await this.db.updateTable("lark_ticket_done_scans").set({ watermark, updated_at: new Date().toISOString() })
      .where("source_key", "=", sourceKey).where("watermark", "<=", watermark).execute();
  }

  async enqueue(input: { sourceKey: string; appId: string; recordId: string; sourceUpdatedAt: string; messageLink: string }) {
    const id = createHash("sha256").update(JSON.stringify([
      input.sourceKey, input.appId, input.recordId, input.sourceUpdatedAt, input.messageLink,
    ])).digest("hex");
    const now = new Date().toISOString();
    await this.db.insertInto("lark_ticket_done_reactions").values({
      job_id: id, source_key: input.sourceKey, app_id: input.appId, record_id: input.recordId,
      source_updated_at: input.sourceUpdatedAt, message_link: input.messageLink,
      root_message_id: null, reaction_id: null, action_run_id: randomUUID(), stage: "pending",
      attempts: 0, next_retry_at: now, error_code: null, created_at: now, updated_at: now,
    }).onConflict((c) => c.column("job_id").doNothing()).execute();
    return this.db.selectFrom("lark_ticket_done_reactions").selectAll().where("job_id", "=", id).executeTakeFirstOrThrow();
  }

  async listPending(sourceKey: string, appId: string, now: string) {
    return this.db.selectFrom("lark_ticket_done_reactions").selectAll()
      .where("source_key", "=", sourceKey).where("app_id", "=", appId)
      .where("stage", "in", ["pending", "adding", "outcome_unknown"])
      .where("attempts", "<", 5).where("next_retry_at", "<=", now)
      .orderBy("created_at").orderBy("job_id").execute();
  }

  async hasUncertainReaction(appId: string, rootMessageId: string, excludingJobId: string) {
    const row = await this.db.selectFrom("lark_ticket_done_reactions").select("job_id")
      .where("app_id", "=", appId).where("root_message_id", "=", rootMessageId)
      .where("job_id", "!=", excludingJobId).where("stage", "in", ["adding", "outcome_unknown"]).executeTakeFirst();
    return Boolean(row);
  }

  async save(job: DoneJob, stage: string, fields: Partial<Pick<DoneJob,
    "root_message_id" | "reaction_id" | "attempts" | "next_retry_at" | "error_code"
  >> = {}): Promise<DoneJob> {
    const row = await this.db.updateTable("lark_ticket_done_reactions")
      .set({ stage, updated_at: new Date().toISOString(), error_code: null, ...fields })
      .where("job_id", "=", job.job_id).where("stage", "=", job.stage)
      .where("attempts", "=", job.attempts).returningAll().executeTakeFirst();
    if (!row) throw new Error("LARK_TICKET_DONE_STATE_CONFLICT");
    return row;
  }
}
