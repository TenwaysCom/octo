import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase } from "../adapters/sqlite/database.js";
import { createTestPostgresDatabase } from "../adapters/postgres/test-db.js";
import { importSqliteDataToPostgres } from "./database-import-sqlite.js";

describe("database-import-sqlite", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("imports users, tokens, and oauth sessions from sqlite into postgres", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tenways-octo-sqlite-import-"));
    tempDirs.push(dir);
    const sqlitePath = join(dir, "legacy.sqlite");
    const sqliteDb = createSqliteDatabase(sqlitePath);

    sqliteDb.prepare(`
      INSERT INTO users (
        id,
        status,
        lark_tenant_key,
        lark_id,
        lark_email,
        meegle_base_url,
        meegle_user_key,
        github_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "usr_1",
      "active",
      "tenant_a",
      "ou_1",
      "pm@example.com",
      "https://project.larksuite.com",
      "meegle_1",
      "gh_1",
      "2026-04-10T00:00:00.000Z",
      "2026-04-10T00:00:00.000Z",
    );

    sqliteDb.prepare(`
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
    `).run(
      "usr_1",
      "meegle",
      "",
      "meegle_1",
      "https://project.larksuite.com",
      "plugin_token_123",
      "2099-01-01T00:00:00.000Z",
      "user_token_456",
      "2099-01-01T00:00:00.000Z",
      "refresh_token_789",
      "2099-02-01T00:00:00.000Z",
      "active",
      "2026-04-10T00:00:00.000Z",
      "2026-04-10T00:05:00.000Z",
      "2026-04-10T00:05:00.000Z",
    );

    sqliteDb.prepare(`
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
    `).run(
      "state_1",
      "lark",
      "usr_1",
      "https://open.larksuite.com",
      "completed",
      "auth_code_123",
      "ou_1",
      null,
      "2026-04-10T01:00:00.000Z",
      "2026-04-10T00:00:00.000Z",
      "2026-04-10T00:05:00.000Z",
    );

    sqliteDb.close();

    const { db } = await createTestPostgresDatabase();

    await importSqliteDataToPostgres({
      sqlitePath,
      db,
    });

    await expect(
      db.selectFrom("users").selectAll().where("id", "=", "usr_1").executeTakeFirst(),
    ).resolves.toMatchObject({
      id: "usr_1",
      lark_tenant_key: "tenant_a",
      meegle_user_key: "meegle_1",
    });

    await expect(
      db.selectFrom("user_tokens").selectAll().where("master_user_id", "=", "usr_1").executeTakeFirst(),
    ).resolves.toMatchObject({
      provider: "meegle",
      plugin_token: "plugin_token_123",
      user_token: "user_token_456",
    });

    await expect(
      db.selectFrom("oauth_sessions").selectAll().where("state", "=", "state_1").executeTakeFirst(),
    ).resolves.toMatchObject({
      state: "state_1",
      auth_code: "auth_code_123",
      external_user_key: "ou_1",
    });
  });
});
