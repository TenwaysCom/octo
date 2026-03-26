import type { DatabaseSync } from "node:sqlite";
import type {
  MeegleTokenLookup,
  MeegleTokenStore,
  StoredMeegleToken,
} from "../meegle/token-store.js";
import { getSharedDatabase } from "./database.js";

interface StoredCredentialRow {
  operator_lark_id: string;
  meegle_user_key: string;
  base_url: string;
  plugin_token: string;
  user_token: string;
  refresh_token: string | null;
  last_auth_at: string;
  last_refresh_at: string | null;
}

export class SqliteMeegleTokenStore implements MeegleTokenStore {
  constructor(private readonly db: DatabaseSync = getSharedDatabase()) {}

  async save(token: StoredMeegleToken): Promise<void> {
    const existing = this.db.prepare(`
      SELECT last_auth_at, last_refresh_at
      FROM meegle_credential
      WHERE operator_lark_id = ? AND meegle_user_key = ? AND base_url = ?
    `).get(
      token.operatorLarkId,
      token.meegleUserKey,
      token.baseUrl,
    ) as { last_auth_at: string; last_refresh_at: string | null } | undefined;

    const now = new Date().toISOString();
    const lastAuthAt = existing?.last_auth_at ?? now;
    const lastRefreshAt = existing ? now : null;

    this.db.prepare(`
      INSERT INTO meegle_credential (
        operator_lark_id,
        meegle_user_key,
        base_url,
        plugin_token,
        user_token,
        refresh_token,
        credential_status,
        last_auth_at,
        last_refresh_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(operator_lark_id, meegle_user_key, base_url) DO UPDATE SET
        plugin_token = excluded.plugin_token,
        user_token = excluded.user_token,
        refresh_token = excluded.refresh_token,
        credential_status = excluded.credential_status,
        last_auth_at = excluded.last_auth_at,
        last_refresh_at = excluded.last_refresh_at,
        updated_at = excluded.updated_at
    `).run(
      token.operatorLarkId,
      token.meegleUserKey,
      token.baseUrl,
      token.pluginToken,
      token.userToken,
      token.refreshToken ?? null,
      "active",
      lastAuthAt,
      lastRefreshAt,
      now,
    );
  }

  async get(
    lookup: MeegleTokenLookup,
  ): Promise<StoredMeegleToken | undefined> {
    const row = this.db.prepare(`
      SELECT
        operator_lark_id,
        meegle_user_key,
        base_url,
        plugin_token,
        user_token,
        refresh_token,
        last_auth_at,
        last_refresh_at
      FROM meegle_credential
      WHERE operator_lark_id = ? AND meegle_user_key = ? AND base_url = ?
    `).get(
      lookup.operatorLarkId,
      lookup.meegleUserKey,
      lookup.baseUrl,
    ) as StoredCredentialRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      operatorLarkId: row.operator_lark_id,
      meegleUserKey: row.meegle_user_key,
      baseUrl: row.base_url,
      pluginToken: row.plugin_token,
      userToken: row.user_token,
      refreshToken: row.refresh_token ?? undefined,
    };
  }

  async delete(lookup: MeegleTokenLookup): Promise<void> {
    this.db.prepare(`
      DELETE FROM meegle_credential
      WHERE operator_lark_id = ? AND meegle_user_key = ? AND base_url = ?
    `).run(
      lookup.operatorLarkId,
      lookup.meegleUserKey,
      lookup.baseUrl,
    );
  }
}

export const sharedMeegleTokenStore = new SqliteMeegleTokenStore();
