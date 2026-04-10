import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export interface ResolvedUserRecord {
  id: string;
  status: "pending_lark_identity" | "active" | "conflict";
  larkTenantKey: string | null;
  larkId: string | null;
  larkEmail: string | null;
  meegleBaseUrl: string | null;
  meegleUserKey: string | null;
  githubId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedUserStore {
  getById(id: string): Promise<ResolvedUserRecord | undefined>;
  getByLarkId(larkId: string): Promise<ResolvedUserRecord | undefined>;
  getByLarkIdentity(larkTenantKey: string, larkId: string): Promise<ResolvedUserRecord | undefined>;
  getByMeegleIdentity(
    meegleBaseUrl: string,
    meegleUserKey: string,
  ): Promise<ResolvedUserRecord | undefined>;
  create(input: {
    status: ResolvedUserRecord["status"];
    larkTenantKey?: string;
    larkId?: string;
    larkEmail?: string;
    meegleBaseUrl?: string;
    meegleUserKey?: string;
    githubId?: string;
  }): Promise<ResolvedUserRecord>;
  update(input: ResolvedUserRecord): Promise<ResolvedUserRecord>;
}

function toRecord(
  row: Selectable<DatabaseSchema["users"]> | undefined,
): ResolvedUserRecord | undefined {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    status:
      row.status === "active" || row.status === "conflict"
        ? row.status
        : "pending_lark_identity",
    larkTenantKey: row.lark_tenant_key,
    larkId: row.lark_id,
    larkEmail: row.lark_email,
    meegleBaseUrl: row.meegle_base_url,
    meegleUserKey: row.meegle_user_key,
    githubId: row.github_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresResolvedUserStore implements ResolvedUserStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async getById(id: string): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      await this.database.selectFrom("users")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst(),
    );
  }

  async getByLarkId(larkId: string): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      await this.database.selectFrom("users")
        .selectAll()
        .where("lark_id", "=", larkId)
        .executeTakeFirst(),
    );
  }

  async getByLarkIdentity(
    larkTenantKey: string,
    larkId: string,
  ): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      await this.database.selectFrom("users")
        .selectAll()
        .where("lark_tenant_key", "=", larkTenantKey)
        .where("lark_id", "=", larkId)
        .executeTakeFirst(),
    );
  }

  async getByMeegleIdentity(
    meegleBaseUrl: string,
    meegleUserKey: string,
  ): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      await this.database.selectFrom("users")
        .selectAll()
        .where("meegle_base_url", "=", meegleBaseUrl)
        .where("meegle_user_key", "=", meegleUserKey)
        .executeTakeFirst(),
    );
  }

  async create(input: {
    status: ResolvedUserRecord["status"];
    larkTenantKey?: string;
    larkId?: string;
    larkEmail?: string;
    meegleBaseUrl?: string;
    meegleUserKey?: string;
    githubId?: string;
  }): Promise<ResolvedUserRecord> {
    const now = new Date().toISOString();
    const id = randomUUID();

    await this.database.insertInto("users").values({
      id,
      status: input.status,
      lark_tenant_key: input.larkTenantKey ?? null,
      lark_id: input.larkId ?? null,
      lark_email: input.larkEmail ?? null,
      meegle_base_url: input.meegleBaseUrl ?? null,
      meegle_user_key: input.meegleUserKey ?? null,
      github_id: input.githubId ?? null,
      created_at: now,
      updated_at: now,
    }).execute();

    return {
      id,
      status: input.status,
      larkTenantKey: input.larkTenantKey ?? null,
      larkId: input.larkId ?? null,
      larkEmail: input.larkEmail ?? null,
      meegleBaseUrl: input.meegleBaseUrl ?? null,
      meegleUserKey: input.meegleUserKey ?? null,
      githubId: input.githubId ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(input: ResolvedUserRecord): Promise<ResolvedUserRecord> {
    const updatedAt = new Date().toISOString();

    await this.database.updateTable("users").set({
      status: input.status,
      lark_tenant_key: input.larkTenantKey,
      lark_id: input.larkId,
      lark_email: input.larkEmail,
      meegle_base_url: input.meegleBaseUrl,
      meegle_user_key: input.meegleUserKey,
      github_id: input.githubId,
      updated_at: updatedAt,
    }).where("id", "=", input.id)
      .execute();

    return {
      ...input,
      updatedAt,
    };
  }
}

let defaultStore: ResolvedUserStore | undefined;

export function configureResolvedUserStore(store: ResolvedUserStore): void {
  defaultStore = store;
}

export function getResolvedUserStore(): ResolvedUserStore {
  if (!defaultStore) {
    defaultStore = new PostgresResolvedUserStore();
  }

  return defaultStore;
}
