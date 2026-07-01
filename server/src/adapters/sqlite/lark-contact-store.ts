import type { DatabaseSync } from "node:sqlite";
import type { LarkContactRecord, LarkContactStore } from "../lark/contact-store.js";
import { getSharedDatabase } from "./database.js";

interface LarkContactRow {
  open_id: string;
  email: string | null;
  name: string | null;
  meegle_user_key: string | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: LarkContactRow | undefined): LarkContactRecord | undefined {
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

export class SqliteLarkContactStore implements LarkContactStore {
  constructor(private readonly db: DatabaseSync = getSharedDatabase()) {}

  async getByOpenId(openId: string): Promise<LarkContactRecord | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT open_id, email, name, meegle_user_key, created_at, updated_at
        FROM lark_contacts
        WHERE open_id = ?
      `).get(openId) as LarkContactRow | undefined,
    );
  }

  async getByEmail(email: string): Promise<LarkContactRecord | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT open_id, email, name, meegle_user_key, created_at, updated_at
        FROM lark_contacts
        WHERE email = ?
      `).get(email) as LarkContactRow | undefined,
    );
  }

  async getByMeegleUserKey(meegleUserKey: string): Promise<LarkContactRecord | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT open_id, email, name, meegle_user_key, created_at, updated_at
        FROM lark_contacts
        WHERE meegle_user_key = ?
      `).get(meegleUserKey) as LarkContactRow | undefined,
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

    this.db.prepare(`
      INSERT INTO lark_contacts (
        open_id,
        email,
        name,
        meegle_user_key,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(open_id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        meegle_user_key = excluded.meegle_user_key,
        updated_at = excluded.updated_at
    `).run(input.openId, email, name, meegleUserKey, createdAt, updatedAt);

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
