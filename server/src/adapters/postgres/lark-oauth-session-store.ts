import type { Kysely, Selectable } from "kysely";
import type {
  OauthSessionStore,
  StoredOauthSession,
} from "../lark/oauth-session-store.js";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

function toRecord(
  row: Selectable<DatabaseSchema["oauth_sessions"]> | undefined,
): StoredOauthSession | undefined {
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

export class PostgresOauthSessionStore implements OauthSessionStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async save(
    session: Omit<StoredOauthSession, "createdAt" | "updatedAt">,
  ): Promise<StoredOauthSession> {
    const existing = await this.get(session.state);
    const now = new Date().toISOString();
    const createdAt = existing?.createdAt ?? now;

    await this.database.insertInto("oauth_sessions").values({
      state: session.state,
      provider: session.provider,
      master_user_id: session.masterUserId ?? null,
      base_url: session.baseUrl,
      status: session.status,
      auth_code: session.authCode ?? null,
      external_user_key: session.externalUserKey ?? null,
      error_code: session.errorCode ?? null,
      expires_at: session.expiresAt,
      created_at: createdAt,
      updated_at: now,
    }).onConflict((conflict) => conflict.column("state").doUpdateSet({
      provider: session.provider,
      master_user_id: session.masterUserId ?? null,
      base_url: session.baseUrl,
      status: session.status,
      auth_code: session.authCode ?? null,
      external_user_key: session.externalUserKey ?? null,
      error_code: session.errorCode ?? null,
      expires_at: session.expiresAt,
      updated_at: now,
    })).execute();

    return {
      ...session,
      createdAt,
      updatedAt: now,
    };
  }

  async get(state: string): Promise<StoredOauthSession | undefined> {
    return toRecord(
      await this.database.selectFrom("oauth_sessions")
        .selectAll()
        .where("state", "=", state)
        .executeTakeFirst(),
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
    await this.database.updateTable("oauth_sessions").set({
      status: "completed",
      auth_code: input.authCode,
      external_user_key: input.externalUserKey,
      master_user_id: input.masterUserId ?? existing.masterUserId ?? null,
      error_code: null,
      updated_at: updatedAt,
    }).where("state", "=", input.state)
      .execute();

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
    await this.database.updateTable("oauth_sessions").set({
      status: "failed",
      error_code: input.errorCode,
      updated_at: updatedAt,
    }).where("state", "=", input.state)
      .execute();

    return {
      ...existing,
      status: "failed",
      errorCode: input.errorCode,
      updatedAt,
    };
  }
}

let sharedOauthSessionStore: PostgresOauthSessionStore | undefined;

export function getSharedOauthSessionStore(): PostgresOauthSessionStore {
  if (!sharedOauthSessionStore) {
    sharedOauthSessionStore = new PostgresOauthSessionStore();
  }

  return sharedOauthSessionStore;
}
