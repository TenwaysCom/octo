import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export type SupportTicketEffectDraftStatus =
  | "pending"
  | "executing"
  | "ticket_ai_written"
  | "completed"
  | "failed"
  | "outcome_unknown";

export interface SupportTicketEffectDraftRecord {
  id: string;
  effectType: "answer_feedback" | "ticket_ai_update";
  baseId: string;
  tableId: string;
  recordId: string;
  sessionId: string;
  operatorLarkId: string;
  actionRunId: string;
  permissionProfileId: string;
  snapshotVersion: number;
  payloadJson: string;
  payloadHash: string;
  status: SupportTicketEffectDraftStatus;
  externalRef: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketEffectDraftStore {
  create(input: Omit<SupportTicketEffectDraftRecord, "status" | "externalRef" | "errorCode" | "errorMessage" | "createdAt" | "updatedAt">): Promise<SupportTicketEffectDraftRecord>;
  get(id: string): Promise<SupportTicketEffectDraftRecord | undefined>;
  list(input: { operatorLarkId: string; baseId: string; tableId: string; recordId: string }): Promise<SupportTicketEffectDraftRecord[]>;
  transition(input: {
    id: string;
    from: SupportTicketEffectDraftStatus[];
    to: SupportTicketEffectDraftStatus;
    externalRef?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<SupportTicketEffectDraftRecord | undefined>;
}

function toRecord(row: Selectable<DatabaseSchema["support_ticket_effect_drafts"]> | undefined): SupportTicketEffectDraftRecord | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    effectType: row.effect_type,
    baseId: row.base_id,
    tableId: row.table_id,
    recordId: row.record_id,
    sessionId: row.session_id,
    operatorLarkId: row.operator_lark_id,
    actionRunId: row.action_run_id,
    permissionProfileId: row.permission_profile_id,
    snapshotVersion: row.snapshot_version,
    payloadJson: row.payload_json,
    payloadHash: row.payload_hash,
    status: row.status,
    externalRef: row.external_ref,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresSupportTicketEffectDraftStore implements SupportTicketEffectDraftStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}
  private get database() { return this.db ?? getSharedDatabase(); }

  async create(input: Omit<SupportTicketEffectDraftRecord, "status" | "externalRef" | "errorCode" | "errorMessage" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    await this.database.insertInto("support_ticket_effect_drafts").values({
      id: input.id,
      effect_type: input.effectType,
      base_id: input.baseId,
      table_id: input.tableId,
      record_id: input.recordId,
      session_id: input.sessionId,
      operator_lark_id: input.operatorLarkId,
      action_run_id: input.actionRunId,
      permission_profile_id: input.permissionProfileId,
      snapshot_version: input.snapshotVersion,
      payload_json: input.payloadJson,
      payload_hash: input.payloadHash,
      status: "pending",
      external_ref: null,
      error_code: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    }).onConflict((conflict) => conflict.columns(["session_id", "action_run_id", "payload_hash"]).doNothing()).execute();
    return (await this.database.selectFrom("support_ticket_effect_drafts").selectAll()
      .where("session_id", "=", input.sessionId).where("action_run_id", "=", input.actionRunId)
      .where("payload_hash", "=", input.payloadHash).executeTakeFirst().then(toRecord))!;
  }

  async get(id: string) {
    return toRecord(await this.database.selectFrom("support_ticket_effect_drafts").selectAll().where("id", "=", id).executeTakeFirst());
  }

  async list(input: { operatorLarkId: string; baseId: string; tableId: string; recordId: string }) {
    return (await this.database.selectFrom("support_ticket_effect_drafts").selectAll()
      .where("operator_lark_id", "=", input.operatorLarkId)
      .where("base_id", "=", input.baseId).where("table_id", "=", input.tableId).where("record_id", "=", input.recordId)
      .orderBy("created_at", "desc").execute()).map((row) => toRecord(row)!);
  }

  async transition(input: { id: string; from: SupportTicketEffectDraftStatus[]; to: SupportTicketEffectDraftStatus; externalRef?: string | null; errorCode?: string | null; errorMessage?: string | null }) {
    const result = await this.database.updateTable("support_ticket_effect_drafts").set({
      status: input.to,
      external_ref: input.externalRef ?? null,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      updated_at: new Date().toISOString(),
    }).where("id", "=", input.id).where("status", "in", input.from).executeTakeFirst();
    return Number(result.numUpdatedRows) ? this.get(input.id) : undefined;
  }
}

let sharedStore: SupportTicketEffectDraftStore | undefined;
export function getSupportTicketEffectDraftStore(): SupportTicketEffectDraftStore {
  return sharedStore ??= new PostgresSupportTicketEffectDraftStore();
}
