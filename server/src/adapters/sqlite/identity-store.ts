import type { DatabaseSync } from "node:sqlite";
import { getSharedDatabase } from "./database.js";

export interface StoredIdentity {
  larkId: string;
  meegleUserKey: string | null;
  mappingStatus: "bound" | "unbound";
  updatedAt: string;
}

export interface IdentityStore {
  save(input: {
    larkId: string;
    meegleUserKey?: string | null;
  }): Promise<StoredIdentity>;
  getByLarkId(larkId: string): Promise<StoredIdentity | undefined>;
}

export class SqliteIdentityStore implements IdentityStore {
  constructor(private readonly db: DatabaseSync = getSharedDatabase()) {}

  async save(input: {
    larkId: string;
    meegleUserKey?: string | null;
  }): Promise<StoredIdentity> {
    const existing = await this.getByLarkId(input.larkId);
    const updatedAt = new Date().toISOString();
    const meegleUserKey = input.meegleUserKey ?? existing?.meegleUserKey ?? null;
    const mappingStatus = meegleUserKey ? "bound" : "unbound";

    this.db.prepare(`
      INSERT INTO user_identity (
        lark_id,
        meegle_user_key,
        mapping_status,
        updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(lark_id) DO UPDATE SET
        meegle_user_key = excluded.meegle_user_key,
        mapping_status = excluded.mapping_status,
        updated_at = excluded.updated_at
    `).run(input.larkId, meegleUserKey, mappingStatus, updatedAt);

    return {
      larkId: input.larkId,
      meegleUserKey,
      mappingStatus,
      updatedAt,
    };
  }

  async getByLarkId(larkId: string): Promise<StoredIdentity | undefined> {
    const row = this.db.prepare(`
      SELECT
        lark_id,
        meegle_user_key,
        mapping_status,
        updated_at
      FROM user_identity
      WHERE lark_id = ?
    `).get(larkId) as {
      lark_id: string;
      meegle_user_key: string | null;
      mapping_status: "bound" | "unbound";
      updated_at: string;
    } | undefined;

    if (!row) {
      return undefined;
    }

    return {
      larkId: row.lark_id,
      meegleUserKey: row.meegle_user_key,
      mappingStatus: row.mapping_status,
      updatedAt: row.updated_at,
    };
  }
}

export const sharedIdentityStore = new SqliteIdentityStore();
