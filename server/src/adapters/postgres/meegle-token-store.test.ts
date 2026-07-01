import { describe, expect, it } from "vitest";
import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresMeegleTokenStore } from "./meegle-token-store.js";

describe("PostgresMeegleTokenStore", () => {
  it("stores meegle tokens in user_tokens with provider=meegle", async () => {
    const { db } = await createTestPostgresDatabase();
    const tokenStore = new PostgresMeegleTokenStore(db);

    await tokenStore.save({
      masterUserId: "usr_xxx",
      meegleUserKey: "user_xxx",
      baseUrl: "https://project.larksuite.com",
      pluginToken: "plugin_token_123",
      pluginTokenExpiresAt: "2099-03-26T12:00:00.000Z",
      userToken: "user_token_456",
      userTokenExpiresAt: "2099-03-26T10:30:00.000Z",
      refreshToken: "refresh_token_789",
      refreshTokenExpiresAt: "2099-04-09T10:00:00.000Z",
      credentialStatus: "active",
    });

    const row = await db.selectFrom("user_tokens").select([
      "provider",
      "master_user_id",
      "external_user_key",
      "base_url",
      "plugin_token",
      "user_token",
      "refresh_token",
      "credential_status",
    ]).where("master_user_id", "=", "usr_xxx")
      .where("provider", "=", "meegle")
      .where("external_user_key", "=", "user_xxx")
      .where("base_url", "=", "https://project.larksuite.com")
      .executeTakeFirst();

    expect(row).toEqual({
      provider: "meegle",
      master_user_id: "usr_xxx",
      external_user_key: "user_xxx",
      base_url: "https://project.larksuite.com",
      plugin_token: "plugin_token_123",
      user_token: "user_token_456",
      refresh_token: "refresh_token_789",
      credential_status: "active",
    });
  });
});
