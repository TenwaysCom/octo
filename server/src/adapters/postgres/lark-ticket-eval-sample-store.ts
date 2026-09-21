import type { Kysely } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import type { LarkTicketEvalSampleUpdate } from "../../domain/lark-ticket-eval-sample.js";

export interface EvalReviewer { id: string; name: string }

export interface LarkTicketEvalSample {
  id: string;
  ticket: { baseId: string; tableId: string; recordId: string; title: string };
  snapshotVersion: number;
  aiOutput: Record<string, unknown>;
  datasetStatus: "draft" | "eval" | "badcase";
  manualIntent?: string;
  expectedOutcome?: string;
  notes?: string;
  failureLabels: string[];
  evalBy?: string;
  evalAt?: string;
  isMyEval?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LarkTicketEvalSampleStore {
  list(reviewerId: string, mine?: boolean): Promise<LarkTicketEvalSample[]>;
  findByTicketSnapshot(ticket: { baseId: string; tableId: string; recordId: string }, snapshotVersion: number, reviewerId?: string): Promise<LarkTicketEvalSample | undefined>;
  create(sample: LarkTicketEvalSample, reviewer: EvalReviewer, actionRunId: string): Promise<LarkTicketEvalSample>;
  update(id: string, update: LarkTicketEvalSampleUpdate, updatedAt: string, reviewer: EvalReviewer): Promise<LarkTicketEvalSample | undefined>;
}

export class PostgresLarkTicketEvalSampleStore implements LarkTicketEvalSampleStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}
  private get database() { return this.db ?? getSharedDatabase(); }

  async list(reviewerId: string, mine = false) {
    let query = this.database.selectFrom("lark_ticket_eval_samples").selectAll();
    if (mine) query = query.where("id", "in", this.database.selectFrom("lark_ticket_eval_reviews")
      .select("sample_id").where("reviewer_id", "=", reviewerId));
    const rows = await query.orderBy("snapshot_version", "desc").orderBy("updated_at", "desc").execute();
    return this.withReviews(rows.map(toSample), reviewerId);
  }

  private async withReviews(samples: LarkTicketEvalSample[], reviewerId?: string) {
    if (!samples.length) return samples;
    const reviews = await this.database.selectFrom("lark_ticket_eval_reviews").selectAll()
      .where("sample_id", "in", samples.map((sample) => sample.id)).orderBy("evaluated_at", "desc").orderBy("action_run_id", "desc").execute();
    return samples.map((sample) => {
      const matching = reviews.filter((review) => review.sample_id === sample.id);
      return { ...sample, evalBy: matching[0]?.reviewer_name, evalAt: matching[0]?.evaluated_at,
        isMyEval: matching.some((review) => review.reviewer_id === reviewerId) };
    });
  }

  async findByTicketSnapshot(ticket: { baseId: string; tableId: string; recordId: string }, snapshotVersion: number, reviewerId?: string) {
    const row = await this.database.selectFrom("lark_ticket_eval_samples").selectAll()
      .where("base_id", "=", ticket.baseId).where("table_id", "=", ticket.tableId).where("record_id", "=", ticket.recordId)
      .where("snapshot_version", "=", snapshotVersion).executeTakeFirst();
    return row ? (await this.withReviews([toSample(row)], reviewerId))[0] : undefined;
  }

  async create(sample: LarkTicketEvalSample, reviewer: EvalReviewer, actionRunId: string) {
    return this.database.transaction().execute(async (trx) => {
      const inserted = await trx.insertInto("lark_ticket_eval_samples").values({
        id: sample.id, base_id: sample.ticket.baseId, table_id: sample.ticket.tableId, record_id: sample.ticket.recordId,
        ticket_title: sample.ticket.title, snapshot_version: sample.snapshotVersion, ai_output_json: JSON.stringify(sample.aiOutput),
        dataset_status: sample.datasetStatus, manual_intent: sample.manualIntent ?? null, expected_outcome: sample.expectedOutcome ?? null,
        notes: sample.notes ?? null, failure_labels_json: JSON.stringify(sample.failureLabels), created_at: sample.createdAt, updated_at: sample.updatedAt,
      }).onConflict((oc) => oc.columns(["base_id", "table_id", "record_id", "snapshot_version"]).doNothing()).returningAll().executeTakeFirst();
      if (inserted) {
        await trx.insertInto("lark_ticket_eval_reviews").values({ sample_id: sample.id, reviewer_id: reviewer.id,
          reviewer_name: reviewer.name, evaluated_at: sample.updatedAt, dataset_status: sample.datasetStatus, action_run_id: actionRunId }).execute();
      }
      const row = inserted ?? await trx.selectFrom("lark_ticket_eval_samples").selectAll()
        .where("base_id", "=", sample.ticket.baseId).where("table_id", "=", sample.ticket.tableId)
        .where("record_id", "=", sample.ticket.recordId).where("snapshot_version", "=", sample.snapshotVersion).executeTakeFirstOrThrow();
      return (await new PostgresLarkTicketEvalSampleStore(trx).withReviews([toSample(row)], reviewer.id))[0]!;
    });
  }

  async update(id: string, update: LarkTicketEvalSampleUpdate, updatedAt: string, reviewer: EvalReviewer) {
    return this.database.transaction().execute(async (trx) => {
      const existing = await trx.selectFrom("lark_ticket_eval_samples").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!existing) return undefined;
      const previous = await trx.selectFrom("lark_ticket_eval_reviews").select("sample_id").where("sample_id", "=", id)
        .where("reviewer_id", "=", reviewer.id).where("action_run_id", "=", update.actionRunId).executeTakeFirst();
      if (previous) return (await new PostgresLarkTicketEvalSampleStore(trx).withReviews([toSample(existing)], reviewer.id))[0];
      // A monotonic per-sample timestamp makes the latest reviewer unambiguous, even for concurrent saves.
      const timestamp = new Date(Math.max(Date.parse(updatedAt), Date.parse(existing.updated_at) + 1)).toISOString();
      const row = await trx.updateTable("lark_ticket_eval_samples").set({
        dataset_status: update.datasetStatus, manual_intent: update.manualIntent ?? null, expected_outcome: update.expectedOutcome ?? null,
        notes: update.notes ?? null, failure_labels_json: JSON.stringify(update.failureLabels), updated_at: timestamp,
      }).where("id", "=", id).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto("lark_ticket_eval_reviews").values({ sample_id: id, reviewer_id: reviewer.id,
        reviewer_name: reviewer.name, evaluated_at: timestamp, dataset_status: update.datasetStatus, action_run_id: update.actionRunId }).execute();
      return { ...toSample(row), evalBy: reviewer.name, evalAt: timestamp, isMyEval: true };
    });
  }

}

function parseRecord(value: string): Record<string, unknown> { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function parseStrings(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : []; } catch { return []; } }
function toSample(row: DatabaseSchema["lark_ticket_eval_samples"]) : LarkTicketEvalSample {
  return { id: row.id, ticket: { baseId: row.base_id, tableId: row.table_id, recordId: row.record_id, title: row.ticket_title }, snapshotVersion: row.snapshot_version,
    aiOutput: parseRecord(row.ai_output_json), datasetStatus: row.dataset_status, manualIntent: row.manual_intent ?? undefined,
    expectedOutcome: row.expected_outcome ?? undefined, notes: row.notes ?? undefined, failureLabels: parseStrings(row.failure_labels_json), createdAt: row.created_at, updatedAt: row.updated_at };
}
