import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase } from "./database.js";
import { SqliteMeegleTokenStore } from "./meegle-token-store.js";

describe("SqliteMeegleTokenStore", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stores meegle tokens in user_tokens with provider=meegle", async () => {
    const db = createSqliteDatabase(":memory:");
    const tokenStore = new SqliteMeegleTokenStore(db);

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

    const row = db.prepare(`
      SELECT
        provider,
        master_user_id,
        external_user_key,
        base_url,
        plugin_token,
        user_token,
        refresh_token,
        credential_status
      FROM user_tokens
      WHERE master_user_id = ? AND provider = ? AND external_user_key = ? AND base_url = ?
    `).get(
      "usr_xxx",
      "meegle",
      "user_xxx",
      "https://project.larksuite.com",
    ) as Record<string, unknown> | undefined;

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

  it("migrates existing meegle_credential rows into user_tokens", () => {
    const dir = mkdtempSync(join(tmpdir(), "tenways-octo-token-migration-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "test.sqlite");

    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      CREATE TABLE meegle_credential (
        master_user_id TEXT NOT NULL,
        meegle_user_key TEXT NOT NULL,
        base_url TEXT NOT NULL,
        plugin_token TEXT NOT NULL,
        plugin_token_expires_at TEXT,
        user_token TEXT NOT NULL,
        user_token_expires_at TEXT,
        refresh_token TEXT,
        refresh_token_expires_at TEXT,
        credential_status TEXT NOT NULL,
        last_auth_at TEXT NOT NULL,
        last_refresh_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (master_user_id, meegle_user_key, base_url)
      );

      INSERT INTO meegle_credential (
        master_user_id,
        meegle_user_key,
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
      ) VALUES (
        'usr_xxx',
        'user_xxx',
        'https://project.larksuite.com',
        'plugin_token_123',
        '2099-03-26T12:00:00.000Z',
        'user_token_456',
        '2099-03-26T10:30:00.000Z',
        'refresh_token_789',
        '2099-04-09T10:00:00.000Z',
        'active',
        '2099-03-26T09:30:00.000Z',
        '2099-03-26T09:45:00.000Z',
        '2099-03-26T09:45:00.000Z'
      );
    `);
    legacyDb.close();

    const migratedDb = createSqliteDatabase(dbPath);

    const migrated = migratedDb.prepare(`
      SELECT
        provider,
        master_user_id,
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
      FROM user_tokens
    `).get() as Record<string, unknown> | undefined;

    expect(migrated).toEqual({
      provider: "meegle",
      master_user_id: "usr_xxx",
      external_user_key: "user_xxx",
      base_url: "https://project.larksuite.com",
      plugin_token: "plugin_token_123",
      plugin_token_expires_at: "2099-03-26T12:00:00.000Z",
      user_token: "user_token_456",
      user_token_expires_at: "2099-03-26T10:30:00.000Z",
      refresh_token: "refresh_token_789",
      refresh_token_expires_at: "2099-04-09T10:00:00.000Z",
      credential_status: "active",
      last_auth_at: "2099-03-26T09:30:00.000Z",
      last_refresh_at: "2099-03-26T09:45:00.000Z",
      updated_at: "2099-03-26T09:45:00.000Z",
    });

    const legacyTable = migratedDb.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'meegle_credential'
    `).get() as { name?: string } | undefined;

    expect(legacyTable).toBeUndefined();
  });
});
