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
  claim(
    sessionId: string,
    operatorLarkId: string,
    title?: string | null,
  ): Promise<AcpKimiSessionOwnershipRecord>;
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

  async claim(
    sessionId: string,
    operatorLarkId: string,
    title?: string | null,
  ): Promise<AcpKimiSessionOwnershipRecord> {
    const now = new Date().toISOString();

    await this.database.insertInto("acp_kimi_session_owners")
      .values({
        session_id: sessionId,
        operator_lark_id: operatorLarkId,
        title: title ?? null,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      })
      .onConflict((conflict) =>
        conflict.column("session_id").doUpdateSet({
          operator_lark_id: operatorLarkId,
          deleted_at: null,
          updated_at: now,
        }))
      .execute();

    return {
      sessionId,
      operatorLarkId,
      title: title ?? null,
      ticketBaseId: null,
      ticketTableId: null,
      ticketRecordId: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
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
  }): Promise<AcpKimiSessionOwnershipRecord | undefined> {
    const result = await this.database.updateTable("acp_kimi_session_owners")
      .set({
        title: input.title,
        ticket_base_id: input.baseId,
        ticket_table_id: input.tableId,
        ticket_record_id: input.recordId,
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
