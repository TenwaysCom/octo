import type { DatabaseSync } from "node:sqlite";
import type {
  LarkTokenLookup,
  LarkTokenStore,
  StoredLarkToken,
} from "../lark/token-store.js";
import { getSharedDatabase } from "./database.js";

interface LarkTokenRow {
  master_user_id: string;
  external_user_key: string;
  base_url: string;
  user_token: string;
  user_token_expires_at: string | null;
  refresh_token: string | null;
  refresh_token_expires_at: string | null;
  credential_status: string;
}

export class SqliteLarkTokenStore implements LarkTokenStore {
  constructor(private readonly db: DatabaseSync = getSharedDatabase()) {}

  async save(token: StoredLarkToken): Promise<void> {
    const existing = this.db.prepare(`
      SELECT last_auth_at, last_refresh_at
      FROM user_tokens
      WHERE master_user_id = ? AND provider = 'lark' AND external_user_key = ? AND base_url = ?
    `).get(
      token.masterUserId,
      token.larkUserId,
      token.baseUrl,
    ) as { last_auth_at: string; last_refresh_at: string | null } | undefined;

    const now = new Date().toISOString();
    const lastAuthAt = existing?.last_auth_at ?? now;
    const lastRefreshAt = existing ? now : null;

    this.db.prepare(`
      INSERT INTO user_tokens (
        master_user_id,
        provider,
        external_user_key,
        base_url,
        plugin_token,
        plugin_token_expires_at,
        user_token,
        user_token_expires_at,
        refresh_token,
        refresh_token_expires_at,
        credential_status,
        last_auth_at,
        last_refresh_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(master_user_id, provider, external_user_key, base_url) DO UPDATE SET
        user_token = excluded.user_token,
        user_token_expires_at = excluded.user_token_expires_at,
        refresh_token = excluded.refresh_token,
        refresh_token_expires_at = excluded.refresh_token_expires_at,
        credential_status = excluded.credential_status,
        last_auth_at = excluded.last_auth_at,
        last_refresh_at = excluded.last_refresh_at,
        updated_at = excluded.updated_at
    `).run(
      token.masterUserId,
      "lark",
      token.larkUserId,
      token.baseUrl,
      null,
      null,
      token.userToken,
      token.userTokenExpiresAt ?? null,
      token.refreshToken ?? null,
      token.refreshTokenExpiresAt ?? null,
      token.credentialStatus ?? "active",
      lastAuthAt,
      lastRefreshAt,
      now,
    );
  }

  async get(lookup: LarkTokenLookup): Promise<StoredLarkToken | undefined> {
    const exactRow = lookup.larkUserId
      ? this.db.prepare(`
        SELECT
          master_user_id,
          external_user_key,
          base_url,
          user_token,
          user_token_expires_at,
          refresh_token,
          refresh_token_expires_at,
          credential_status
        FROM user_tokens
        WHERE master_user_id = ? AND provider = 'lark' AND external_user_key = ? AND base_url = ?
      `).get(
        lookup.masterUserId,
        lookup.larkUserId,
        lookup.baseUrl,
      ) as LarkTokenRow | undefined
      : undefined;

    const row = exactRow ?? this.db.prepare(`
      SELECT
        master_user_id,
        external_user_key,
        base_url,
        user_token,
        user_token_expires_at,
        refresh_token,
        refresh_token_expires_at,
        credential_status
      FROM user_tokens
      WHERE master_user_id = ? AND provider = 'lark'
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(
      lookup.masterUserId,
    ) as LarkTokenRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      masterUserId: row.master_user_id,
      larkUserId: row.external_user_key,
      baseUrl: row.base_url,
      userToken: row.user_token,
      userTokenExpiresAt: row.user_token_expires_at ?? undefined,
      refreshToken: row.refresh_token ?? undefined,
      refreshTokenExpiresAt: row.refresh_token_expires_at ?? undefined,
      credentialStatus: row.credential_status === "expired" ? "expired" : "active",
    };
  }

  async delete(lookup: LarkTokenLookup): Promise<void> {
    if (lookup.larkUserId) {
      this.db.prepare(`
        DELETE FROM user_tokens
        WHERE master_user_id = ? AND provider = 'lark' AND external_user_key = ? AND base_url = ?
      `).run(
        lookup.masterUserId,
        lookup.larkUserId,
        lookup.baseUrl,
      );
      return;
    }

    this.db.prepare(`
      DELETE FROM user_tokens
      WHERE master_user_id = ? AND provider = 'lark'
    `).run(lookup.masterUserId);
  }
}

let sharedLarkTokenStore: SqliteLarkTokenStore | undefined;

export function getSharedLarkTokenStore(): SqliteLarkTokenStore {
  if (!sharedLarkTokenStore) {
    sharedLarkTokenStore = new SqliteLarkTokenStore();
  }

  return sharedLarkTokenStore;
}
