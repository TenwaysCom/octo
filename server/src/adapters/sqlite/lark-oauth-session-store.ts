import type { DatabaseSync } from "node:sqlite";
import type {
  OauthSessionStore,
  StoredOauthSession,
} from "../lark/oauth-session-store.js";
import { getSharedDatabase } from "./database.js";

interface OauthSessionRow {
  state: string;
  provider: string;
  master_user_id: string | null;
  base_url: string;
  status: string;
  auth_code: string | null;
  external_user_key: string | null;
  error_code: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

function toRecord(row: OauthSessionRow | undefined): StoredOauthSession | undefined {
  if (!row) {
    return undefined;
  }

  return {
    state: row.state,
    provider: "lark",
    masterUserId: row.master_user_id ?? undefined,
    baseUrl: row.base_url,
    status:
      row.status === "completed" || row.status === "failed"
        ? row.status
        : "pending",
    authCode: row.auth_code ?? undefined,
    externalUserKey: row.external_user_key ?? undefined,
    errorCode: row.error_code ?? undefined,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteOauthSessionStore implements OauthSessionStore {
  constructor(private readonly db: DatabaseSync = getSharedDatabase()) {}

  async save(
    session: Omit<StoredOauthSession, "createdAt" | "updatedAt">,
  ): Promise<StoredOauthSession> {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO oauth_sessions (
        state,
        provider,
        master_user_id,
        base_url,
        status,
        auth_code,
        external_user_key,
        error_code,
        expires_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(state) DO UPDATE SET
        provider = excluded.provider,
        master_user_id = excluded.master_user_id,
        base_url = excluded.base_url,
        status = excluded.status,
        auth_code = excluded.auth_code,
        external_user_key = excluded.external_user_key,
        error_code = excluded.error_code,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `).run(
      session.state,
      session.provider,
      session.masterUserId ?? null,
      session.baseUrl,
      session.status,
      session.authCode ?? null,
      session.externalUserKey ?? null,
      session.errorCode ?? null,
      session.expiresAt,
      now,
      now,
    );

    return {
      ...session,
      createdAt: now,
      updatedAt: now,
    };
  }

  async get(state: string): Promise<StoredOauthSession | undefined> {
    return toRecord(
      this.db.prepare(`
        SELECT
          state,
          provider,
          master_user_id,
          base_url,
          status,
          auth_code,
          external_user_key,
          error_code,
          expires_at,
          created_at,
          updated_at
        FROM oauth_sessions
        WHERE state = ?
      `).get(state) as OauthSessionRow | undefined,
    );
  }

  async markCompleted(input: {
    state: string;
    authCode: string;
    externalUserKey: string;
    masterUserId?: string;
  }): Promise<StoredOauthSession | undefined> {
    const existing = await this.get(input.state);
    if (!existing) {
      return undefined;
    }

    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      UPDATE oauth_sessions
      SET
        status = 'completed',
        auth_code = ?,
        external_user_key = ?,
        master_user_id = ?,
        error_code = NULL,
        updated_at = ?
      WHERE state = ?
    `).run(
      input.authCode,
      input.externalUserKey,
      input.masterUserId ?? existing.masterUserId ?? null,
      updatedAt,
      input.state,
    );

    return {
      ...existing,
      status: "completed",
      authCode: input.authCode,
      externalUserKey: input.externalUserKey,
      masterUserId: input.masterUserId ?? existing.masterUserId,
      errorCode: undefined,
      updatedAt,
    };
  }

  async markFailed(input: {
    state: string;
    errorCode: string;
  }): Promise<StoredOauthSession | undefined> {
    const existing = await this.get(input.state);
    if (!existing) {
      return undefined;
    }

    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      UPDATE oauth_sessions
      SET
        status = 'failed',
        error_code = ?,
        updated_at = ?
      WHERE state = ?
    `).run(
      input.errorCode,
      updatedAt,
      input.state,
    );

    return {
      ...existing,
      status: "failed",
      errorCode: input.errorCode,
      updatedAt,
    };
  }
}

let sharedOauthSessionStore: SqliteOauthSessionStore | undefined;

export function getSharedOauthSessionStore(): SqliteOauthSessionStore {
  if (!sharedOauthSessionStore) {
    sharedOauthSessionStore = new SqliteOauthSessionStore();
  }

  return sharedOauthSessionStore;
}
