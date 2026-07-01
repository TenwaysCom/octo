import { describe, expect, it } from "vitest";

import { createTestPostgresDatabase } from "../adapters/postgres/test-db.js";
import { parseArgs, syncUserTokens } from "./sync-user-tokens.js";

const sourceToken = {
  master_user_id: "usr_1",
  provider: "lark",
  provider_tenant_key: "tenant_1",
  external_user_key: "ou_1",
  base_url: "https://open.larksuite.com",
  plugin_token: null,
  plugin_token_expires_at: null,
  user_token: "source-user-token",
  user_token_expires_at: "2026-07-01T00:00:00.000Z",
  refresh_token: "source-refresh-token",
  refresh_token_expires_at: "2026-08-01T00:00:00.000Z",
  credential_status: "active",
  last_auth_at: "2026-06-01T00:00:00.000Z",
  last_refresh_at: "2026-06-02T00:00:00.000Z",
  updated_at: "2026-06-03T00:00:00.000Z",
};

describe("sync-user-tokens", () => {
  it("uses the default master user id when no positional id is provided", () => {
    expect(parseArgs(["--postgres-uri", "postgres://u:p@localhost:5432/postgres"])).toEqual({
      masterUserId: "a400632e-8d08-4ddf-977d-e8330b0adc5a",
      sourceDatabase: "tenways_octo",
      targetDatabase: "tenways_octo_ly_0509",
      postgresUri: "postgres://u:p@localhost:5432/postgres",
    });
  });

  it("parses the master user id with default database names", () => {
    expect(parseArgs(["usr_1", "--postgres-uri", "postgres://u:p@localhost:5432/postgres"])).toEqual({
      masterUserId: "usr_1",
      sourceDatabase: "tenways_octo",
      targetDatabase: "tenways_octo_ly_0509",
      postgresUri: "postgres://u:p@localhost:5432/postgres",
    });
  });

  it("replaces target user_tokens with source rows for the master user", async () => {
    const source = await createTestPostgresDatabase();
    const target = await createTestPostgresDatabase();

    try {
      await source.db.insertInto("user_tokens").values(sourceToken).execute();
      await target.db.insertInto("user_tokens").values({
        ...sourceToken,
        user_token: "old-target-token",
        user_token_expires_at: "2026-06-10T00:00:00.000Z",
      }).execute();

      const result = await syncUserTokens(source.db, target.db, "usr_1");
      const rows = await target.db
        .selectFrom("user_tokens")
        .selectAll()
        .where("master_user_id", "=", "usr_1")
        .execute();

      expect(result).toEqual({
        copiedRows: 1,
        deletedRows: "1",
        expiries: [
          {
            provider: "lark",
            providerTenantKey: "tenant_1",
            externalUserKey: "ou_1",
            baseUrl: "https://open.larksuite.com",
            pluginTokenExpiresAt: null,
            userTokenExpiresAt: "2026-07-01T00:00:00.000Z",
            refreshTokenExpiresAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-06-03T00:00:00.000Z",
          },
        ],
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.user_token).toBe("source-user-token");
      expect(rows[0]?.user_token_expires_at).toBe("2026-07-01T00:00:00.000Z");
    } finally {
      await source.db.destroy();
      await target.db.destroy();
    }
  });
});
