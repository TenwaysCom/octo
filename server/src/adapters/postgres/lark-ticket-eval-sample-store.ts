import type { Kysely } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import type { LarkTicketEvalSampleUpdate } from "../../domain/lark-ticket-eval-sample.js";

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
  createdAt: string;
  updatedAt: string;
}

export interface LarkTicketEvalSampleStore {
  list(): Promise<LarkTicketEvalSample[]>;
  findByTicketSnapshot(ticket: { baseId: string; tableId: string; recordId: string }, snapshotVersion: number): Promise<LarkTicketEvalSample | undefined>;
  create(sample: LarkTicketEvalSample): Promise<LarkTicketEvalSample>;
  update(id: string, update: LarkTicketEvalSampleUpdate, updatedAt: string): Promise<LarkTicketEvalSample | undefined>;
}

export class PostgresLarkTicketEvalSampleStore implements LarkTicketEvalSampleStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}
  private get database() { return this.db ?? getSharedDatabase(); }

  async list() {
    const rows = await this.database.selectFrom("lark_ticket_eval_samples").selectAll().orderBy("updated_at", "desc").execute();
    return rows.map(toSample);
  }

  async findByTicketSnapshot(ticket: { baseId: string; tableId: string; recordId: string }, snapshotVersion: number) {
    const row = await this.database.selectFrom("lark_ticket_eval_samples").selectAll()
      .where("base_id", "=", ticket.baseId).where("table_id", "=", ticket.tableId).where("record_id", "=", ticket.recordId)
      .where("snapshot_version", "=", snapshotVersion).executeTakeFirst();
    return row ? toSample(row) : undefined;
  }

  async create(sample: LarkTicketEvalSample) {
    await this.database.insertInto("lark_ticket_eval_samples").values({
      id: sample.id, base_id: sample.ticket.baseId, table_id: sample.ticket.tableId, record_id: sample.ticket.recordId,
      ticket_title: sample.ticket.title, snapshot_version: sample.snapshotVersion, ai_output_json: JSON.stringify(sample.aiOutput),
      dataset_status: sample.datasetStatus, manual_intent: sample.manualIntent ?? null, expected_outcome: sample.expectedOutcome ?? null,
      notes: sample.notes ?? null, failure_labels_json: JSON.stringify(sample.failureLabels), created_at: sample.createdAt, updated_at: sample.updatedAt,
    }).execute();
    return sample;
  }

  async update(id: string, update: LarkTicketEvalSampleUpdate, updatedAt: string) {
    const row = await this.database.updateTable("lark_ticket_eval_samples").set({
      dataset_status: update.datasetStatus, manual_intent: update.manualIntent ?? null, expected_outcome: update.expectedOutcome ?? null,
      notes: update.notes ?? null, failure_labels_json: JSON.stringify(update.failureLabels), updated_at: updatedAt,
    }).where("id", "=", id).returningAll().executeTakeFirst();
    return row ? toSample(row) : undefined;
  }
}

function parseRecord(value: string): Record<string, unknown> { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function parseStrings(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : []; } catch { return []; } }
function toSample(row: DatabaseSchema["lark_ticket_eval_samples"]) : LarkTicketEvalSample {
  return { id: row.id, ticket: { baseId: row.base_id, tableId: row.table_id, recordId: row.record_id, title: row.ticket_title }, snapshotVersion: row.snapshot_version,
    aiOutput: parseRecord(row.ai_output_json), datasetStatus: row.dataset_status, manualIntent: row.manual_intent ?? undefined,
    expectedOutcome: row.expected_outcome ?? undefined, notes: row.notes ?? undefined, failureLabels: parseStrings(row.failure_labels_json), createdAt: row.created_at, updatedAt: row.updated_at };
}
