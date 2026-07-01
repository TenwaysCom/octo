import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getSharedDatabase } from "./database.js";

export interface ResolvedUserRecord {
  id: string;
  status: "pending_lark_identity" | "active" | "conflict";
  larkTenantKey: string | null;
  larkId: string | null;
  larkEmail: string | null;
  larkName: string | null;
  larkAvatarUrl: string | null;
  meegleBaseUrl: string | null;
  meegleUserKey: string | null;
  githubId: string | null;
  role: string | null;
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
    larkName?: string;
    larkAvatarUrl?: string;
    meegleBaseUrl?: string;
    meegleUserKey?: string;
    githubId?: string;
    role?: string;
  }): Promise<ResolvedUserRecord>;
  update(input: ResolvedUserRecord): Promise<ResolvedUserRecord>;
}

interface UserRow {
  id: string;
  status: string;
  lark_tenant_key: string | null;
  lark_id: string | null;
  lark_email: string | null;
  lark_name: string | null;
  lark_avatar_url: string | null;
  meegle_base_url: string | null;
  meegle_user_key: string | null;
  github_id: string | null;
  role: string | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: UserRow | undefined): ResolvedUserRecord | undefined {
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
    larkName: row.lark_name,
    larkAvatarUrl: row.lark_avatar_url,
    meegleBaseUrl: row.meegle_base_url,
    meegleUserKey: row.meegle_user_key,
    githubId: row.github_id,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteResolvedUserStore implements ResolvedUserStore {
  constructor(private readonly db: DatabaseSync = getSharedDatabase()) {}

  async getById(id: string): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT id, status, lark_tenant_key, lark_id, lark_email, lark_name, lark_avatar_url, meegle_base_url, meegle_user_key, github_id, role, created_at, updated_at
        FROM users
        WHERE id = ?
      `).get(id) as UserRow | undefined,
    );
  }

  async getByLarkId(larkId: string): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT id, status, lark_tenant_key, lark_id, lark_email, lark_name, lark_avatar_url, meegle_base_url, meegle_user_key, github_id, role, created_at, updated_at
        FROM users
        WHERE lark_id = ?
      `).get(larkId) as UserRow | undefined,
    );
  }

  async getByLarkIdentity(
    larkTenantKey: string,
    larkId: string,
  ): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT id, status, lark_tenant_key, lark_id, lark_email, lark_name, lark_avatar_url, meegle_base_url, meegle_user_key, github_id, role, created_at, updated_at
        FROM users
        WHERE lark_tenant_key = ? AND lark_id = ?
      `).get(larkTenantKey, larkId) as UserRow | undefined,
    );
  }

  async getByMeegleIdentity(
    meegleBaseUrl: string,
    meegleUserKey: string,
  ): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT id, status, lark_tenant_key, lark_id, lark_email, lark_name, lark_avatar_url, meegle_base_url, meegle_user_key, github_id, role, created_at, updated_at
        FROM users
        WHERE meegle_base_url = ? AND meegle_user_key = ?
      `).get(meegleBaseUrl, meegleUserKey) as UserRow | undefined,
    );
  }

  async create(input: {
    status: ResolvedUserRecord["status"];
    larkTenantKey?: string;
    larkId?: string;
    larkEmail?: string;
    larkName?: string;
    larkAvatarUrl?: string;
    meegleBaseUrl?: string;
    meegleUserKey?: string;
    githubId?: string;
    role?: string;
  }): Promise<ResolvedUserRecord> {
    const now = new Date().toISOString();
    const id = randomUUID();

    this.db.prepare(`
      INSERT INTO users (
        id,
        status,
        lark_tenant_key,
        lark_id,
        lark_email,
        lark_name,
        lark_avatar_url,
        meegle_base_url,
        meegle_user_key,
        github_id,
        role,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.status,
      input.larkTenantKey ?? null,
      input.larkId ?? null,
      input.larkEmail ?? null,
      input.larkName ?? null,
      input.larkAvatarUrl ?? null,
      input.meegleBaseUrl ?? null,
      input.meegleUserKey ?? null,
      input.githubId ?? null,
      input.role ?? null,
      now,
      now,
    );

    return {
      id,
      status: input.status,
      larkTenantKey: input.larkTenantKey ?? null,
      larkId: input.larkId ?? null,
      larkEmail: input.larkEmail ?? null,
      larkName: input.larkName ?? null,
      larkAvatarUrl: input.larkAvatarUrl ?? null,
      meegleBaseUrl: input.meegleBaseUrl ?? null,
      meegleUserKey: input.meegleUserKey ?? null,
      githubId: input.githubId ?? null,
      role: input.role ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(input: ResolvedUserRecord): Promise<ResolvedUserRecord> {
    const updatedAt = new Date().toISOString();

    this.db.prepare(`
      UPDATE users
      SET
        status = ?,
        lark_tenant_key = ?,
        lark_id = ?,
        lark_email = ?,
        lark_name = ?,
        lark_avatar_url = ?,
        meegle_base_url = ?,
        meegle_user_key = ?,
        github_id = ?,
        role = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.status,
      input.larkTenantKey,
      input.larkId,
      input.larkEmail,
      input.larkName,
      input.larkAvatarUrl,
      input.meegleBaseUrl,
      input.meegleUserKey,
      input.githubId,
      input.role,
      updatedAt,
      input.id,
    );

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
    defaultStore = new SqliteResolvedUserStore();
  }

  return defaultStore;
}
