import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export interface AcpKimiSessionOwnershipRecord {
  sessionId: string;
  operatorLarkId: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcpKimiSessionOwnershipStore {
  getBySessionId(sessionId: string): Promise<AcpKimiSessionOwnershipRecord | undefined>;
  listByOperatorLarkId(operatorLarkId: string): Promise<AcpKimiSessionOwnershipRecord[]>;
  claim(
    sessionId: string,
    operatorLarkId: string,
  ): Promise<AcpKimiSessionOwnershipRecord>;
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

  async claim(
    sessionId: string,
    operatorLarkId: string,
  ): Promise<AcpKimiSessionOwnershipRecord> {
    const now = new Date().toISOString();

    await this.database.insertInto("acp_kimi_session_owners")
      .values({
        session_id: sessionId,
        operator_lark_id: operatorLarkId,
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
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
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
