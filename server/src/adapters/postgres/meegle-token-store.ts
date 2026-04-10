import type { Kysely, Selectable } from "kysely";
import type {
  MeegleTokenLookup,
  MeegleTokenStore,
  StoredMeegleToken,
} from "../meegle/token-store.js";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

function toRecord(
  row: Selectable<DatabaseSchema["user_tokens"]> | undefined,
): StoredMeegleToken | undefined {
  if (!row) {
    return undefined;
  }

  return {
    masterUserId: row.master_user_id,
    meegleUserKey: row.external_user_key,
    baseUrl: row.base_url,
    pluginToken: row.plugin_token ?? "",
    pluginTokenExpiresAt: row.plugin_token_expires_at ?? undefined,
    userToken: row.user_token,
    userTokenExpiresAt: row.user_token_expires_at ?? undefined,
    refreshToken: row.refresh_token ?? undefined,
    refreshTokenExpiresAt: row.refresh_token_expires_at ?? undefined,
    credentialStatus: row.credential_status === "expired" ? "expired" : "active",
  };
}

export class PostgresMeegleTokenStore implements MeegleTokenStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async save(token: StoredMeegleToken): Promise<void> {
    const existing = await this.database.selectFrom("user_tokens")
      .select(["last_auth_at", "last_refresh_at"])
      .where("master_user_id", "=", token.masterUserId)
      .where("provider", "=", "meegle")
      .where("provider_tenant_key", "=", "")
      .where("external_user_key", "=", token.meegleUserKey)
      .where("base_url", "=", token.baseUrl)
      .executeTakeFirst();

    const now = new Date().toISOString();
    const lastAuthAt = existing?.last_auth_at ?? now;
    const lastRefreshAt = existing ? now : null;

    await this.database.insertInto("user_tokens").values({
      master_user_id: token.masterUserId,
      provider: "meegle",
      provider_tenant_key: "",
      external_user_key: token.meegleUserKey,
      base_url: token.baseUrl,
      plugin_token: token.pluginToken,
      plugin_token_expires_at: token.pluginTokenExpiresAt ?? null,
      user_token: token.userToken,
      user_token_expires_at: token.userTokenExpiresAt ?? null,
      refresh_token: token.refreshToken ?? null,
      refresh_token_expires_at: token.refreshTokenExpiresAt ?? null,
      credential_status: token.credentialStatus ?? "active",
      last_auth_at: lastAuthAt,
      last_refresh_at: lastRefreshAt,
      updated_at: now,
    }).onConflict((conflict) => conflict.columns([
      "master_user_id",
      "provider",
      "provider_tenant_key",
      "external_user_key",
      "base_url",
    ]).doUpdateSet({
      plugin_token: token.pluginToken,
      plugin_token_expires_at: token.pluginTokenExpiresAt ?? null,
      user_token: token.userToken,
      user_token_expires_at: token.userTokenExpiresAt ?? null,
      refresh_token: token.refreshToken ?? null,
      refresh_token_expires_at: token.refreshTokenExpiresAt ?? null,
      credential_status: token.credentialStatus ?? "active",
      last_auth_at: lastAuthAt,
      last_refresh_at: lastRefreshAt,
      updated_at: now,
    })).execute();
  }

  async get(lookup: MeegleTokenLookup): Promise<StoredMeegleToken | undefined> {
    const exactRow = await this.database.selectFrom("user_tokens")
      .selectAll()
      .where("master_user_id", "=", lookup.masterUserId)
      .where("provider", "=", "meegle")
      .where("provider_tenant_key", "=", "")
      .where("external_user_key", "=", lookup.meegleUserKey)
      .where("base_url", "=", lookup.baseUrl)
      .executeTakeFirst();

    const row = exactRow ?? await this.database.selectFrom("user_tokens")
      .selectAll()
      .where("master_user_id", "=", lookup.masterUserId)
      .where("provider", "=", "meegle")
      .where("external_user_key", "=", lookup.meegleUserKey)
      .orderBy("updated_at", "desc")
      .limit(1)
      .executeTakeFirst();

    return toRecord(row);
  }

  async delete(lookup: MeegleTokenLookup): Promise<void> {
    await this.database.deleteFrom("user_tokens")
      .where("master_user_id", "=", lookup.masterUserId)
      .where("provider", "=", "meegle")
      .where("provider_tenant_key", "=", "")
      .where("external_user_key", "=", lookup.meegleUserKey)
      .where("base_url", "=", lookup.baseUrl)
      .execute();
  }
}

let sharedMeegleTokenStore: PostgresMeegleTokenStore | undefined;

export function getSharedMeegleTokenStore(): PostgresMeegleTokenStore {
  if (!sharedMeegleTokenStore) {
    sharedMeegleTokenStore = new PostgresMeegleTokenStore();
  }

  return sharedMeegleTokenStore;
}
