import type { Kysely, Selectable } from "kysely";
import type {
  StoredWebPluginLoginChallenge,
  WebPluginLoginChallengeStore,
} from "../web/plugin-login-challenge-store.js";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

function toRecord(
  row: Selectable<DatabaseSchema["web_plugin_login_challenges"]> | undefined,
): StoredWebPluginLoginChallenge | undefined {
  if (!row) {
    return undefined;
  }

  return {
    challengeIdHash: row.challenge_id_hash,
    browserProofHash: row.browser_proof_hash,
    status: row.status as StoredWebPluginLoginChallenge["status"],
    masterUserId: row.master_user_id ?? undefined,
    baseUrl: row.base_url ?? undefined,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    consumedAt: row.consumed_at ?? undefined,
  };
}

export class PostgresWebPluginLoginChallengeStore implements WebPluginLoginChallengeStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async create(
    challenge: Omit<StoredWebPluginLoginChallenge, "createdAt" | "updatedAt" | "consumedAt">,
  ): Promise<StoredWebPluginLoginChallenge> {
    const now = new Date().toISOString();
    await this.database.insertInto("web_plugin_login_challenges").values({
      challenge_id_hash: challenge.challengeIdHash,
      browser_proof_hash: challenge.browserProofHash,
      status: challenge.status,
      master_user_id: challenge.masterUserId ?? null,
      base_url: challenge.baseUrl ?? null,
      expires_at: challenge.expiresAt,
      created_at: now,
      updated_at: now,
      consumed_at: null,
    }).execute();

    return { ...challenge, createdAt: now, updatedAt: now };
  }

  async get(challengeIdHash: string): Promise<StoredWebPluginLoginChallenge | undefined> {
    return toRecord(await this.database.selectFrom("web_plugin_login_challenges")
      .selectAll()
      .where("challenge_id_hash", "=", challengeIdHash)
      .executeTakeFirst());
  }

  async approve(input: {
    challengeIdHash: string;
    masterUserId: string;
    baseUrl: string;
    now: string;
  }): Promise<StoredWebPluginLoginChallenge | undefined> {
    return toRecord(await this.database.updateTable("web_plugin_login_challenges")
      .set({
        status: "approved",
        master_user_id: input.masterUserId,
        base_url: input.baseUrl,
        updated_at: input.now,
      })
      .where("challenge_id_hash", "=", input.challengeIdHash)
      .where("status", "=", "pending")
      .where("expires_at", ">", input.now)
      .returningAll()
      .executeTakeFirst());
  }

  async consume(input: {
    challengeIdHash: string;
    browserProofHash: string;
    now: string;
  }): Promise<StoredWebPluginLoginChallenge | undefined> {
    return toRecord(await this.database.updateTable("web_plugin_login_challenges")
      .set({
        status: "consumed",
        consumed_at: input.now,
        updated_at: input.now,
      })
      .where("challenge_id_hash", "=", input.challengeIdHash)
      .where("browser_proof_hash", "=", input.browserProofHash)
      .where("status", "=", "approved")
      .where("expires_at", ">", input.now)
      .returningAll()
      .executeTakeFirst());
  }
}

let sharedWebPluginLoginChallengeStore: PostgresWebPluginLoginChallengeStore | undefined;

export function getSharedWebPluginLoginChallengeStore(): PostgresWebPluginLoginChallengeStore {
  if (!sharedWebPluginLoginChallengeStore) {
    sharedWebPluginLoginChallengeStore = new PostgresWebPluginLoginChallengeStore();
  }

  return sharedWebPluginLoginChallengeStore;
}
