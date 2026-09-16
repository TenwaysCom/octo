import type { Kysely, Selectable } from "kysely";
import type { LarkContactRecord, LarkContactStore } from "../lark/contact-store.js";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

function toRecord(
  row: Selectable<DatabaseSchema["lark_contacts"]> | undefined,
): LarkContactRecord | undefined {
  if (!row) {
    return undefined;
  }

  return {
    openId: row.open_id,
    email: row.email,
    name: row.name,
    meegleUserKey: row.meegle_user_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresLarkContactStore implements LarkContactStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async getByOpenId(openId: string): Promise<LarkContactRecord | undefined> {
    return toRecord(
      await this.database.selectFrom("lark_contacts")
        .selectAll()
        .where("open_id", "=", openId)
        .executeTakeFirst(),
    );
  }

  async getByEmail(email: string): Promise<LarkContactRecord | undefined> {
    return toRecord(
      await this.database.selectFrom("lark_contacts")
        .selectAll()
        .where("email", "=", email)
        .executeTakeFirst(),
    );
  }

  async getByMeegleUserKey(meegleUserKey: string): Promise<LarkContactRecord | undefined> {
    return toRecord(
      await this.database.selectFrom("lark_contacts")
        .selectAll()
        .where("meegle_user_key", "=", meegleUserKey)
        .executeTakeFirst(),
    );
  }

  async upsert(input: {
    openId: string;
    email?: string | null;
    name?: string | null;
    meegleUserKey?: string | null;
  }): Promise<LarkContactRecord> {
    const existing = await this.getByOpenId(input.openId);
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const email = input.email ?? null;
    const name = input.name ?? null;
    const meegleUserKey = input.meegleUserKey === undefined
      ? existing?.meegleUserKey ?? null
      : input.meegleUserKey;

    await this.database.insertInto("lark_contacts").values({
      open_id: input.openId,
      email,
      name,
      meegle_user_key: meegleUserKey,
      created_at: createdAt,
      updated_at: updatedAt,
    }).onConflict((conflict) => conflict.column("open_id").doUpdateSet({
      email,
      name,
      meegle_user_key: meegleUserKey,
      updated_at: updatedAt,
    })).execute();

    return {
      openId: input.openId,
      email,
      name,
      meegleUserKey,
      createdAt,
      updatedAt,
    };
  }
}

let defaultStore: LarkContactStore | undefined;

export function configureLarkContactStore(store: LarkContactStore): void {
  defaultStore = store;
}

export function getLarkContactStore(): LarkContactStore {
  if (!defaultStore) {
    defaultStore = new PostgresLarkContactStore();
  }

  return defaultStore;
}
