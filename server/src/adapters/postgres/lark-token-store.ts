import type { Kysely, Selectable } from "kysely";
import type {
  LarkTokenLookup,
  LarkTokenStore,
  StoredLarkToken,
} from "../lark/token-store.js";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

function toRecord(
  row: Selectable<DatabaseSchema["user_tokens"]> | undefined,
): StoredLarkToken | undefined {
  if (!row) {
    return undefined;
  }

  return {
    masterUserId: row.master_user_id,
    tenantKey: row.provider_tenant_key || undefined,
    larkUserId: row.external_user_key,
    baseUrl: row.base_url,
    userToken: row.user_token,
    userTokenExpiresAt: row.user_token_expires_at ?? undefined,
    refreshToken: row.refresh_token ?? undefined,
    refreshTokenExpiresAt: row.refresh_token_expires_at ?? undefined,
    credentialStatus: row.credential_status === "expired" ? "expired" : "active",
  };
}

export class PostgresLarkTokenStore implements LarkTokenStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async save(token: StoredLarkToken): Promise<void> {
    const existing = await this.database.selectFrom("user_tokens")
      .select(["last_auth_at", "last_refresh_at"])
      .where("master_user_id", "=", token.masterUserId)
      .where("provider", "=", "lark")
      .where("provider_tenant_key", "=", token.tenantKey ?? "")
      .where("external_user_key", "=", token.larkUserId)
      .where("base_url", "=", token.baseUrl)
      .executeTakeFirst();

    const now = new Date().toISOString();
    const lastAuthAt = existing?.last_auth_at ?? now;
    const lastRefreshAt = existing ? now : null;

    await this.database.insertInto("user_tokens").values({
      master_user_id: token.masterUserId,
      provider: "lark",
      provider_tenant_key: token.tenantKey ?? "",
      external_user_key: token.larkUserId,
      base_url: token.baseUrl,
      plugin_token: null,
      plugin_token_expires_at: null,
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

  async get(lookup: LarkTokenLookup): Promise<StoredLarkToken | undefined> {
    const exactRow = lookup.larkUserId && typeof lookup.tenantKey === "string"
      ? await this.database.selectFrom("user_tokens")
        .selectAll()
        .where("master_user_id", "=", lookup.masterUserId)
        .where("provider", "=", "lark")
        .where("provider_tenant_key", "=", lookup.tenantKey ?? "")
        .where("external_user_key", "=", lookup.larkUserId)
        .where("base_url", "=", lookup.baseUrl)
        .executeTakeFirst()
      : undefined;

    const byUserIdRow = !exactRow && lookup.larkUserId
      ? await this.database.selectFrom("user_tokens")
        .selectAll()
        .where("master_user_id", "=", lookup.masterUserId)
        .where("provider", "=", "lark")
        .where("external_user_key", "=", lookup.larkUserId)
        .where("base_url", "=", lookup.baseUrl)
        .orderBy("updated_at", "desc")
        .limit(1)
        .executeTakeFirst()
      : undefined;

    const row = exactRow ??
      byUserIdRow ??
      await this.database.selectFrom("user_tokens")
        .selectAll()
        .where("master_user_id", "=", lookup.masterUserId)
        .where("provider", "=", "lark")
        .orderBy("updated_at", "desc")
        .limit(1)
        .executeTakeFirst();

    return toRecord(row);
  }

  async delete(lookup: LarkTokenLookup): Promise<void> {
    if (lookup.larkUserId) {
      await this.database.deleteFrom("user_tokens")
        .where("master_user_id", "=", lookup.masterUserId)
        .where("provider", "=", "lark")
        .where("provider_tenant_key", "=", lookup.tenantKey ?? "")
        .where("external_user_key", "=", lookup.larkUserId)
        .where("base_url", "=", lookup.baseUrl)
        .execute();
      return;
    }

    await this.database.deleteFrom("user_tokens")
      .where("master_user_id", "=", lookup.masterUserId)
      .where("provider", "=", "lark")
      .execute();
  }
}

let sharedLarkTokenStore: PostgresLarkTokenStore | undefined;

export function getSharedLarkTokenStore(): PostgresLarkTokenStore {
  if (!sharedLarkTokenStore) {
    sharedLarkTokenStore = new PostgresLarkTokenStore();
  }

  return sharedLarkTokenStore;
}
