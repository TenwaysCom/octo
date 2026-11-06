import { sql, type Kysely, type Selectable } from "kysely";
import type { LarkContactRecord, LarkContactStore } from "../lark/contact-store.js";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export interface LarkTicketAvatarRange {
  baseId: string;
  tableId: string;
  startTime: string;
  endTime: string;
  timeField: "created_time" | "source_updated_at" | "synced_at";
}

export interface LarkTicketAvatarSource {
  recordId: string;
  fieldsJson: string;
  syncedAt: string;
}

export interface LarkContactAvatarInput {
  openId: string;
  avatarUrl: string;
  sourceSyncedAt: string;
}

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
    avatarUrl: row.avatar_url ?? null,
    avatarSourceSyncedAt: row.avatar_source_synced_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresLarkContactStore implements LarkContactStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async listAvatarsByOpenIds(openIds: string[]): Promise<Array<{ openId: string; avatarUrl: string | null }>> {
    if (!openIds.length) return [];
    return this.database.selectFrom("lark_contacts")
      .select(["open_id as openId", "avatar_url as avatarUrl"])
      .where("open_id", "in", [...new Set(openIds)])
      .execute();
  }

  async listTicketAvatarSources(range: LarkTicketAvatarRange): Promise<LarkTicketAvatarSource[]> {
    // Time columns are stored as text; compare instants including legacy offset forms.
    const time = sql<string>`${sql.ref(range.timeField)}::timestamptz`;
    return this.database.selectFrom("lark_base_ticket_syncs")
      .select(["record_id as recordId", "fields_json as fieldsJson", "synced_at as syncedAt"])
      .where("base_id", "=", range.baseId)
      .where("table_id", "=", range.tableId)
      .where(time, ">=", range.startTime)
      .where(time, "<", range.endTime)
      .execute();
  }

  async upsertAvatars(avatars: LarkContactAvatarInput[], updatedAt: string): Promise<number> {
    if (!avatars.length) return 0;
    return this.database.transaction().execute(async (trx) => {
      let written = 0;
      // A stable lock order reduces deadlocks between overlapping extraction runs.
      for (const avatar of [...avatars].sort((a, b) => a.openId.localeCompare(b.openId))) {
        const result = await trx.insertInto("lark_contacts").values({
          open_id: avatar.openId,
          avatar_url: avatar.avatarUrl,
          avatar_source_synced_at: avatar.sourceSyncedAt,
          created_at: updatedAt,
          updated_at: updatedAt,
        }).onConflict((conflict) => conflict.column("open_id").doUpdateSet({
          avatar_url: avatar.avatarUrl,
          avatar_source_synced_at: avatar.sourceSyncedAt,
          updated_at: updatedAt,
        }).where((eb) => eb.or([
          eb("lark_contacts.avatar_source_synced_at", "is", null),
          eb("lark_contacts.avatar_source_synced_at", "<", avatar.sourceSyncedAt),
        ]))).returning("open_id").executeTakeFirst();
        if (result) written++;
      }
      return written;
    });
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
      avatarUrl: existing?.avatarUrl ?? null,
      avatarSourceSyncedAt: existing?.avatarSourceSyncedAt ?? null,
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
