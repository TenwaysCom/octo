import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getSharedDatabase } from "./database.js";

export interface ResolvedUserRecord {
  id: string;
  status: "pending_lark_identity" | "active" | "conflict";
  larkId: string | null;
  meegleUserKey: string | null;
  githubId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedUserStore {
  getById(id: string): Promise<ResolvedUserRecord | undefined>;
  getByLarkId(larkId: string): Promise<ResolvedUserRecord | undefined>;
  getByMeegleUserKey(meegleUserKey: string): Promise<ResolvedUserRecord | undefined>;
  create(input: {
    status: ResolvedUserRecord["status"];
    larkId?: string;
    meegleUserKey?: string;
    githubId?: string;
  }): Promise<ResolvedUserRecord>;
  update(input: ResolvedUserRecord): Promise<ResolvedUserRecord>;
}

interface UserRow {
  id: string;
  status: string;
  lark_id: string | null;
  meegle_user_key: string | null;
  github_id: string | null;
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
    larkId: row.lark_id,
    meegleUserKey: row.meegle_user_key,
    githubId: row.github_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteResolvedUserStore implements ResolvedUserStore {
  constructor(private readonly db: DatabaseSync = getSharedDatabase()) {}

  async getById(id: string): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT id, status, lark_id, meegle_user_key, github_id, created_at, updated_at
        FROM users
        WHERE id = ?
      `).get(id) as UserRow | undefined,
    );
  }

  async getByLarkId(larkId: string): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT id, status, lark_id, meegle_user_key, github_id, created_at, updated_at
        FROM users
        WHERE lark_id = ?
      `).get(larkId) as UserRow | undefined,
    );
  }

  async getByMeegleUserKey(
    meegleUserKey: string,
  ): Promise<ResolvedUserRecord | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT id, status, lark_id, meegle_user_key, github_id, created_at, updated_at
        FROM users
        WHERE meegle_user_key = ?
      `).get(meegleUserKey) as UserRow | undefined,
    );
  }

  async create(input: {
    status: ResolvedUserRecord["status"];
    larkId?: string;
    meegleUserKey?: string;
    githubId?: string;
  }): Promise<ResolvedUserRecord> {
    const now = new Date().toISOString();
    const id = randomUUID();

    this.db.prepare(`
      INSERT INTO users (
        id,
        status,
        lark_id,
        meegle_user_key,
        github_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.status,
      input.larkId ?? null,
      input.meegleUserKey ?? null,
      input.githubId ?? null,
      now,
      now,
    );

    return {
      id,
      status: input.status,
      larkId: input.larkId ?? null,
      meegleUserKey: input.meegleUserKey ?? null,
      githubId: input.githubId ?? null,
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
        lark_id = ?,
        meegle_user_key = ?,
        github_id = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.status,
      input.larkId,
      input.meegleUserKey,
      input.githubId,
      updatedAt,
      input.id,
    );

    return {
      ...input,
      updatedAt,
    };
  }
}

let defaultStore: ResolvedUserStore = new SqliteResolvedUserStore();

export function configureResolvedUserStore(store: ResolvedUserStore): void {
  defaultStore = store;
}

export function getResolvedUserStore(): ResolvedUserStore {
  return defaultStore;
}
