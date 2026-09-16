import type { DatabaseSync } from "node:sqlite";
import type {
  MeegleTokenLookup,
  MeegleTokenStore,
  StoredMeegleToken,
} from "../meegle/token-store.js";
import { getSharedDatabase } from "./database.js";

interface StoredCredentialRow {
  master_user_id: string;
  provider: string;
  provider_tenant_key: string;
  external_user_key: string;
  base_url: string;
  plugin_token: string;
  plugin_token_expires_at: string | null;
  user_token: string;
  user_token_expires_at: string | null;
  refresh_token: string | null;
  refresh_token_expires_at: string | null;
  credential_status: string;
  last_auth_at: string;
  last_refresh_at: string | null;
}

export class SqliteMeegleTokenStore implements MeegleTokenStore {
  constructor(private readonly db: DatabaseSync = getSharedDatabase()) {}

  async save(token: StoredMeegleToken): Promise<void> {
    const existing = this.db.prepare(`
      SELECT last_auth_at, last_refresh_at
      FROM user_tokens
      WHERE master_user_id = ? AND provider = 'meegle' AND provider_tenant_key = '' AND external_user_key = ? AND base_url = ?
    `).get(
      token.masterUserId,
      token.meegleUserKey,
      token.baseUrl,
    ) as { last_auth_at: string; last_refresh_at: string | null } | undefined;

    const now = new Date().toISOString();
    const lastAuthAt = existing?.last_auth_at ?? now;
    const lastRefreshAt = existing ? now : null;

    this.db.prepare(`
      INSERT INTO user_tokens (
        master_user_id,
        provider,
        provider_tenant_key,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(master_user_id, provider, provider_tenant_key, external_user_key, base_url) DO UPDATE SET
        plugin_token = excluded.plugin_token,
        plugin_token_expires_at = excluded.plugin_token_expires_at,
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
      "meegle",
      "",
      token.meegleUserKey,
      token.baseUrl,
      token.pluginToken,
      token.pluginTokenExpiresAt ?? null,
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

  async get(
    lookup: MeegleTokenLookup,
  ): Promise<StoredMeegleToken | undefined> {
    const exactRow = this.db.prepare(`
      SELECT
        master_user_id,
        provider,
        provider_tenant_key,
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
        last_refresh_at
      FROM user_tokens
      WHERE master_user_id = ? AND provider = 'meegle' AND provider_tenant_key = '' AND external_user_key = ? AND base_url = ?
    `).get(
      lookup.masterUserId,
      lookup.meegleUserKey,
      lookup.baseUrl,
    ) as StoredCredentialRow | undefined;

    const row = exactRow ?? this.db.prepare(`
      SELECT
        master_user_id,
        provider,
        provider_tenant_key,
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
        last_refresh_at
      FROM user_tokens
      WHERE master_user_id = ? AND provider = 'meegle' AND external_user_key = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(
      lookup.masterUserId,
      lookup.meegleUserKey,
    ) as StoredCredentialRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      masterUserId: row.master_user_id,
      meegleUserKey: row.external_user_key,
      baseUrl: row.base_url,
      pluginToken: row.plugin_token,
      pluginTokenExpiresAt: row.plugin_token_expires_at ?? undefined,
      userToken: row.user_token,
      userTokenExpiresAt: row.user_token_expires_at ?? undefined,
      refreshToken: row.refresh_token ?? undefined,
      refreshTokenExpiresAt: row.refresh_token_expires_at ?? undefined,
      credentialStatus: row.credential_status === "expired" ? "expired" : "active",
    };
  }

  async delete(lookup: MeegleTokenLookup): Promise<void> {
    this.db.prepare(`
      DELETE FROM user_tokens
      WHERE master_user_id = ? AND provider = 'meegle' AND provider_tenant_key = '' AND external_user_key = ? AND base_url = ?
    `).run(
      lookup.masterUserId,
      lookup.meegleUserKey,
      lookup.baseUrl,
    );
  }
}

let sharedMeegleTokenStore: SqliteMeegleTokenStore | undefined;

export function getSharedMeegleTokenStore(): SqliteMeegleTokenStore {
  if (!sharedMeegleTokenStore) {
    sharedMeegleTokenStore = new SqliteMeegleTokenStore();
  }

  return sharedMeegleTokenStore;
}
