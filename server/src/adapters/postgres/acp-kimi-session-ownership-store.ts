import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export interface AcpKimiSessionOwnershipRecord {
  sessionId: string;
  operatorLarkId: string;
  title: string | null;
  ticketBaseId: string | null;
  ticketTableId: string | null;
  ticketRecordId: string | null;
  ticketNumber: string | null;
  runtimeHostName: string | null;
  kimiWorkDir: string | null;
  automationActionKey: string | null;
  executionPolicy: string | null;
  skillProfile: string | null;
  skillId: string | null;
  policyVersion: string | null;
  threadId: string | null;
  threadSnapshotVersion: number | null;
  threadContextSyncedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcpKimiSessionOwnershipStore {
  getBySessionId(sessionId: string): Promise<AcpKimiSessionOwnershipRecord | undefined>;
  listByOperatorLarkId(operatorLarkId: string): Promise<AcpKimiSessionOwnershipRecord[]>;
  listByTicket(input: {
    operatorLarkId: string;
    baseId: string;
    tableId: string;
    recordId: string;
  }): Promise<AcpKimiSessionOwnershipRecord[]>;
  claim(input: {
    sessionId: string;
    operatorLarkId: string;
    title?: string | null;
    runtimeHostName?: string | null;
    kimiWorkDir?: string | null;
    automationActionKey?: string | null;
    executionPolicy?: string | null;
    skillProfile?: string | null;
    skillId?: string | null;
    policyVersion?: string | null;
  }): Promise<AcpKimiSessionOwnershipRecord>;
  rename(
    sessionId: string,
    operatorLarkId: string,
    title: string,
  ): Promise<AcpKimiSessionOwnershipRecord | undefined>;
  attachTicket(input: {
    sessionId: string;
    operatorLarkId: string;
    title: string;
    baseId: string;
    tableId: string;
    recordId: string;
    ticketNumber?: string | null;
    threadId?: string | null;
    threadSnapshotVersion?: number | null;
    threadContextSyncedAt?: string | null;
  }): Promise<AcpKimiSessionOwnershipRecord | undefined>;
  touch(sessionId: string, operatorLarkId: string): Promise<void>;
  deleteForOperator(sessionId: string, operatorLarkId: string): Promise<boolean>;
}

function toRecord(
  row: Selectable<DatabaseSchema["acp_kimi_session_owners"]> | undefined,
): AcpKimiSessionOwnershipRecord | undefined {
  if (!row) {
    return undefined;
  }

  return {
    sessionId: row.session_id,
    operatorLarkId: row.operator_lark_id,
    title: row.title ?? null,
    ticketBaseId: row.ticket_base_id ?? null,
    ticketTableId: row.ticket_table_id ?? null,
    ticketRecordId: row.ticket_record_id ?? null,
    ticketNumber: row.ticket_number ?? null,
    runtimeHostName: row.runtime_host_name ?? null,
    kimiWorkDir: row.kimi_work_dir ?? null,
    automationActionKey: row.automation_action_key ?? null,
    executionPolicy: row.execution_policy ?? null,
    skillProfile: row.skill_profile ?? null,
    skillId: row.skill_id ?? null,
    policyVersion: row.policy_version ?? null,
    threadId: row.thread_id ?? null,
    threadSnapshotVersion: row.thread_snapshot_version ?? null,
    threadContextSyncedAt: row.thread_context_synced_at ?? null,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresAcpKimiSessionOwnershipStore
  implements AcpKimiSessionOwnershipStore
{
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async getBySessionId(
    sessionId: string,
  ): Promise<AcpKimiSessionOwnershipRecord | undefined> {
    return toRecord(
      await this.database.selectFrom("acp_kimi_session_owners")
        .selectAll()
        .where("session_id", "=", sessionId)
        .executeTakeFirst(),
    );
  }

  async listByOperatorLarkId(
    operatorLarkId: string,
  ): Promise<AcpKimiSessionOwnershipRecord[]> {
    return (await this.database.selectFrom("acp_kimi_session_owners")
      .selectAll()
      .where("operator_lark_id", "=", operatorLarkId)
      .where("deleted_at", "is", null)
      .orderBy("updated_at", "desc")
      .execute()).map((row) => toRecord(row)!);
  }

  async listByTicket(input: {
    operatorLarkId: string;
    baseId: string;
    tableId: string;
    recordId: string;
    ticketNumber?: string | null;
    threadId?: string | null;
    threadSnapshotVersion?: number | null;
    threadContextSyncedAt?: string | null;
  }): Promise<AcpKimiSessionOwnershipRecord[]> {
    return (await this.database.selectFrom("acp_kimi_session_owners")
      .selectAll()
      .where("operator_lark_id", "=", input.operatorLarkId)
      .where("ticket_base_id", "=", input.baseId)
      .where("ticket_table_id", "=", input.tableId)
      .where("ticket_record_id", "=", input.recordId)
      .where("deleted_at", "is", null)
      .orderBy("updated_at", "desc")
      .execute()).map((row) => toRecord(row)!);
  }

  async claim(input: {
    sessionId: string;
    operatorLarkId: string;
    title?: string | null;
    runtimeHostName?: string | null;
    kimiWorkDir?: string | null;
    automationActionKey?: string | null;
    executionPolicy?: string | null;
    skillProfile?: string | null;
    skillId?: string | null;
    policyVersion?: string | null;
  }): Promise<AcpKimiSessionOwnershipRecord> {
    const now = new Date().toISOString();

    await this.database.insertInto("acp_kimi_session_owners")
      .values({
        session_id: input.sessionId,
        operator_lark_id: input.operatorLarkId,
        title: input.title ?? null,
        runtime_host_name: input.runtimeHostName ?? null,
        kimi_work_dir: input.kimiWorkDir ?? null,
        automation_action_key: input.automationActionKey ?? null,
        execution_policy: input.executionPolicy ?? null,
        skill_profile: input.skillProfile ?? null,
        skill_id: input.skillId ?? null,
        policy_version: input.policyVersion ?? null,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      })
      .onConflict((conflict) =>
        conflict.column("session_id").doUpdateSet({
          operator_lark_id: input.operatorLarkId,
          deleted_at: null,
          updated_at: now,
        }))
      .execute();

    return (await this.getBySessionId(input.sessionId))!;
  }

  async rename(
    sessionId: string,
    operatorLarkId: string,
    title: string,
  ): Promise<AcpKimiSessionOwnershipRecord | undefined> {
    const now = new Date().toISOString();
    const result = await this.database.updateTable("acp_kimi_session_owners")
      .set({
        title,
        updated_at: now,
      })
      .where("session_id", "=", sessionId)
      .where("operator_lark_id", "=", operatorLarkId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (Number(result.numUpdatedRows) === 0) {
      return undefined;
    }

    return this.getBySessionId(sessionId);
  }

  async attachTicket(input: {
    sessionId: string;
    operatorLarkId: string;
    title: string;
    baseId: string;
    tableId: string;
    recordId: string;
    ticketNumber?: string | null;
    threadId?: string | null;
    threadSnapshotVersion?: number | null;
    threadContextSyncedAt?: string | null;
  }): Promise<AcpKimiSessionOwnershipRecord | undefined> {
    const result = await this.database.updateTable("acp_kimi_session_owners")
      .set({
        title: input.title,
        ticket_base_id: input.baseId,
        ticket_table_id: input.tableId,
        ticket_record_id: input.recordId,
        ticket_number: input.ticketNumber ?? null,
        thread_id: input.threadId ?? null,
        thread_snapshot_version: input.threadSnapshotVersion ?? null,
        thread_context_synced_at: input.threadContextSyncedAt ?? null,
        updated_at: new Date().toISOString(),
      })
      .where("session_id", "=", input.sessionId)
      .where("operator_lark_id", "=", input.operatorLarkId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0
      ? this.getBySessionId(input.sessionId)
      : undefined;
  }

  async touch(sessionId: string, operatorLarkId: string): Promise<void> {
    await this.database.updateTable("acp_kimi_session_owners")
      .set({ updated_at: new Date().toISOString() })
      .where("session_id", "=", sessionId)
      .where("operator_lark_id", "=", operatorLarkId)
      .where("deleted_at", "is", null)
      .execute();
  }

  async deleteForOperator(
    sessionId: string,
    operatorLarkId: string,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.database.updateTable("acp_kimi_session_owners")
      .set({
        deleted_at: now,
        updated_at: now,
      })
      .where("session_id", "=", sessionId)
      .where("operator_lark_id", "=", operatorLarkId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }
}

let defaultStore: AcpKimiSessionOwnershipStore | undefined;

export function configureAcpKimiSessionOwnershipStore(
  store: AcpKimiSessionOwnershipStore,
): void {
  defaultStore = store;
}

export function getAcpKimiSessionOwnershipStore(): AcpKimiSessionOwnershipStore {
  if (!defaultStore) {
    defaultStore = new PostgresAcpKimiSessionOwnershipStore();
  }

  return defaultStore;
}
