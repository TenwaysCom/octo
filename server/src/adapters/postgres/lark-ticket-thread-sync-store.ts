import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import {
  prepareTicketThread,
  SUPPORT_REDACTION_VERSION,
  type PreparedTicketMessage,
} from "../../domain/support-ticket-analysis.js";

export interface LarkTicketThreadRef {
  baseId: string;
  tableId: string;
  recordId: string;
}

export interface LarkTicketThreadMessage {
  messageId: string;
  rootId?: string;
  parentId?: string;
  threadId?: string;
  messageType?: string;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
  senderId?: string;
  senderType?: string;
  content?: string;
}

export interface LarkTicketThreadMessagesDocument {
  schemaVersion: 1;
  messages: LarkTicketThreadMessage[];
}

export interface PreparedLarkTicketThreadMessagesDocument {
  schemaVersion: 1;
  redactionVersion: string;
  snapshotVersion: number;
  messages: PreparedTicketMessage[];
}

export interface LarkTicketThreadSnapshot extends LarkTicketThreadRef {
  messageLink: string;
  threadId: string;
  messages: LarkTicketThreadMessage[];
  preparedMessages: PreparedTicketMessage[];
  snapshotVersion: number;
  historyComplete: boolean;
  watermarkCreatedAt?: string;
  watermarkMessageId?: string;
  lastCheckedAt?: string;
  lastSuccessfulSyncAt?: string;
  lastFullReconciledAt?: string;
  dirty: boolean;
  frozenAt?: string;
  frozenStatus?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LarkTicketThreadSyncStore {
  get(ref: LarkTicketThreadRef): Promise<LarkTicketThreadSnapshot | undefined>;
  saveSuccessfulSync(input: LarkTicketThreadRef & {
    messageLink: string;
    threadId: string;
    messages: LarkTicketThreadMessage[];
    historyComplete: boolean;
    watermarkCreatedAt?: string;
    watermarkMessageId?: string;
    checkedAt: string;
    fullReconciledAt?: string;
    frozenStatus?: string;
  }): Promise<LarkTicketThreadSnapshot>;
  markChecked(ref: LarkTicketThreadRef, checkedAt: string): Promise<LarkTicketThreadSnapshot | undefined>;
  markFrozen(ref: LarkTicketThreadRef, status: string, frozenAt: string): Promise<LarkTicketThreadSnapshot | undefined>;
  markDirty(ref: LarkTicketThreadRef): Promise<void>;
  markFailure(ref: LarkTicketThreadRef, error: string, checkedAt: string): Promise<void>;
}

function parseMessages(value: string): LarkTicketThreadMessage[] {
  try {
    const document = JSON.parse(value) as Partial<LarkTicketThreadMessagesDocument>;
    return document.schemaVersion === 1 && Array.isArray(document.messages)
      ? document.messages
      : [];
  } catch {
    return [];
  }
}

function serializeMessages(messages: LarkTicketThreadMessage[]): string {
  return JSON.stringify({ schemaVersion: 1, messages } satisfies LarkTicketThreadMessagesDocument);
}

function parsePreparedMessages(value: string | null, snapshotVersion: number): PreparedTicketMessage[] | undefined {
  if (!value) return undefined;
  try {
    const document = JSON.parse(value) as Partial<PreparedLarkTicketThreadMessagesDocument>;
    return document.schemaVersion === 1
      && document.redactionVersion === SUPPORT_REDACTION_VERSION
      && document.snapshotVersion === snapshotVersion
      && Array.isArray(document.messages)
      ? document.messages
      : undefined;
  } catch {
    return undefined;
  }
}

export function serializePreparedMessages(messages: PreparedTicketMessage[], snapshotVersion: number): string {
  return JSON.stringify({
    schemaVersion: 1,
    redactionVersion: SUPPORT_REDACTION_VERSION,
    snapshotVersion,
    messages,
  } satisfies PreparedLarkTicketThreadMessagesDocument);
}

function toSnapshot(
  row: Selectable<DatabaseSchema["lark_ticket_thread_syncs"]> | undefined,
): LarkTicketThreadSnapshot | undefined {
  if (!row) return undefined;
  const messages = parseMessages(row.messages_json);
  return {
    baseId: row.base_id,
    tableId: row.table_id,
    recordId: row.record_id,
    messageLink: row.message_link,
    threadId: row.thread_id,
    messages,
    preparedMessages: parsePreparedMessages(row.prepared_messages_json, row.snapshot_version) ?? prepareTicketThread(messages),
    snapshotVersion: row.snapshot_version,
    historyComplete: row.history_complete,
    watermarkCreatedAt: row.watermark_created_at ?? undefined,
    watermarkMessageId: row.watermark_message_id ?? undefined,
    lastCheckedAt: row.last_checked_at ?? undefined,
    lastSuccessfulSyncAt: row.last_successful_sync_at ?? undefined,
    lastFullReconciledAt: row.last_full_reconciled_at ?? undefined,
    dirty: row.dirty,
    frozenAt: row.frozen_at ?? undefined,
    frozenStatus: row.frozen_status ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresLarkTicketThreadSyncStore implements LarkTicketThreadSyncStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async get(ref: LarkTicketThreadRef): Promise<LarkTicketThreadSnapshot | undefined> {
    return toSnapshot(await this.database.selectFrom("lark_ticket_thread_syncs")
      .selectAll()
      .where("base_id", "=", ref.baseId)
      .where("table_id", "=", ref.tableId)
      .where("record_id", "=", ref.recordId)
      .executeTakeFirst());
  }

  async saveSuccessfulSync(input: LarkTicketThreadRef & {
    messageLink: string;
    threadId: string;
    messages: LarkTicketThreadMessage[];
    historyComplete: boolean;
    watermarkCreatedAt?: string;
    watermarkMessageId?: string;
    checkedAt: string;
    fullReconciledAt?: string;
    frozenStatus?: string;
  }): Promise<LarkTicketThreadSnapshot> {
    const current = await this.get(input);
    const messagesJson = serializeMessages(input.messages);
    const currentMessagesJson = current ? serializeMessages(current.messages) : undefined;
    const contentChanged = !current
      || current.threadId !== input.threadId
      || currentMessagesJson !== messagesJson;
    const snapshotVersion = current
      ? current.snapshotVersion + (contentChanged ? 1 : 0)
      : 1;
    const preparedMessagesJson = serializePreparedMessages(prepareTicketThread(input.messages), snapshotVersion);
    const now = input.checkedAt;
    const frozenAt = input.frozenStatus ? current?.frozenAt ?? now : null;

    await this.database.insertInto("lark_ticket_thread_syncs")
      .values({
        base_id: input.baseId,
        table_id: input.tableId,
        record_id: input.recordId,
        message_link: input.messageLink,
        thread_id: input.threadId,
        messages_json: messagesJson,
        prepared_messages_json: preparedMessagesJson,
        snapshot_version: snapshotVersion,
        history_complete: input.historyComplete,
        watermark_created_at: input.watermarkCreatedAt ?? null,
        watermark_message_id: input.watermarkMessageId ?? null,
        last_checked_at: now,
        last_successful_sync_at: now,
        last_full_reconciled_at: input.fullReconciledAt ?? current?.lastFullReconciledAt ?? null,
        dirty: false,
        frozen_at: frozenAt,
        frozen_status: input.frozenStatus ?? null,
        last_error: null,
        created_at: current?.createdAt ?? now,
        updated_at: now,
      })
      .onConflict((conflict) => conflict.columns(["base_id", "table_id", "record_id"]).doUpdateSet({
        message_link: input.messageLink,
        thread_id: input.threadId,
        messages_json: messagesJson,
        prepared_messages_json: preparedMessagesJson,
        snapshot_version: snapshotVersion,
        history_complete: input.historyComplete,
        watermark_created_at: input.watermarkCreatedAt ?? null,
        watermark_message_id: input.watermarkMessageId ?? null,
        last_checked_at: now,
        last_successful_sync_at: now,
        last_full_reconciled_at: input.fullReconciledAt ?? current?.lastFullReconciledAt ?? null,
        dirty: false,
        frozen_at: frozenAt,
        frozen_status: input.frozenStatus ?? null,
        last_error: null,
        updated_at: now,
      }))
      .execute();

    return (await this.get(input))!;
  }

  async markChecked(ref: LarkTicketThreadRef, checkedAt: string): Promise<LarkTicketThreadSnapshot | undefined> {
    await this.database.updateTable("lark_ticket_thread_syncs")
      .set({ last_checked_at: checkedAt, last_error: null, dirty: false, updated_at: checkedAt })
      .where("base_id", "=", ref.baseId)
      .where("table_id", "=", ref.tableId)
      .where("record_id", "=", ref.recordId)
      .execute();
    return this.get(ref);
  }

  async markFrozen(ref: LarkTicketThreadRef, status: string, frozenAt: string): Promise<LarkTicketThreadSnapshot | undefined> {
    await this.database.updateTable("lark_ticket_thread_syncs")
      .set({ frozen_at: frozenAt, frozen_status: status, updated_at: frozenAt })
      .where("base_id", "=", ref.baseId)
      .where("table_id", "=", ref.tableId)
      .where("record_id", "=", ref.recordId)
      .execute();
    return this.get(ref);
  }

  async markDirty(ref: LarkTicketThreadRef): Promise<void> {
    await this.database.updateTable("lark_ticket_thread_syncs")
      .set({ dirty: true, updated_at: new Date().toISOString() })
      .where("base_id", "=", ref.baseId)
      .where("table_id", "=", ref.tableId)
      .where("record_id", "=", ref.recordId)
      .execute();
  }

  async markFailure(ref: LarkTicketThreadRef, error: string, checkedAt: string): Promise<void> {
    await this.database.updateTable("lark_ticket_thread_syncs")
      .set({ last_checked_at: checkedAt, last_error: error.slice(0, 1000), updated_at: checkedAt })
      .where("base_id", "=", ref.baseId)
      .where("table_id", "=", ref.tableId)
      .where("record_id", "=", ref.recordId)
      .execute();
  }
}
