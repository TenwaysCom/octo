import type { Kysely, Selectable } from "kysely";
import type { StoredWebSession, WebSessionStore } from "../web/session-store.js";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

function toRecord(
  row: Selectable<DatabaseSchema["web_sessions"]> | undefined,
): StoredWebSession | undefined {
  if (!row) {
    return undefined;
  }

  return {
    sessionTokenHash: row.session_token_hash,
    masterUserId: row.master_user_id,
    baseUrl: row.base_url,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    invalidatedAt: row.invalidated_at ?? undefined,
  };
}

export class PostgresWebSessionStore implements WebSessionStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async create(
    session: Omit<StoredWebSession, "createdAt" | "updatedAt" | "invalidatedAt">,
  ): Promise<StoredWebSession> {
    const now = new Date().toISOString();
    await this.database.insertInto("web_sessions").values({
      session_token_hash: session.sessionTokenHash,
      master_user_id: session.masterUserId,
      base_url: session.baseUrl,
      expires_at: session.expiresAt,
      created_at: now,
      updated_at: now,
      invalidated_at: null,
    }).execute();

    return {
      ...session,
      createdAt: now,
      updatedAt: now,
    };
  }

  async get(sessionTokenHash: string): Promise<StoredWebSession | undefined> {
    return toRecord(
      await this.database.selectFrom("web_sessions")
        .selectAll()
        .where("session_token_hash", "=", sessionTokenHash)
        .executeTakeFirst(),
    );
  }

  async invalidate(sessionTokenHash: string): Promise<void> {
    await this.database.updateTable("web_sessions").set({
      invalidated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).where("session_token_hash", "=", sessionTokenHash).execute();
  }
}

let sharedWebSessionStore: PostgresWebSessionStore | undefined;

export function getSharedWebSessionStore(): PostgresWebSessionStore {
  if (!sharedWebSessionStore) {
    sharedWebSessionStore = new PostgresWebSessionStore();
  }

  return sharedWebSessionStore;
}
