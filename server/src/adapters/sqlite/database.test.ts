import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, resetSqliteDatabase } from "./database.js";

describe("sqlite database helpers", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resets an existing sqlite file and recreates the current schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "tenways-octo-db-reset-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "test.sqlite");

    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      CREATE TABLE legacy_only (value TEXT);
      INSERT INTO legacy_only (value) VALUES ('stale');
    `);
    legacyDb.close();

    resetSqliteDatabase(dbPath);

    expect(existsSync(dbPath)).toBe(true);

    const resetDb = new DatabaseSync(dbPath);
    const usersTable = resetDb.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'users'
    `).get() as { name?: string } | undefined;
    const tokenTable = resetDb.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'user_tokens'
    `).get() as { name?: string } | undefined;
    const legacyTable = resetDb.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'legacy_only'
    `).get() as { name?: string } | undefined;
    resetDb.close();

    expect(usersTable?.name).toBe("users");
    expect(tokenTable?.name).toBe("user_tokens");
    expect(legacyTable).toBeUndefined();
  });

  it("can recreate the schema in a previously missing database file", () => {
    const dir = mkdtempSync(join(tmpdir(), "tenways-octo-db-create-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "fresh.sqlite");

    resetSqliteDatabase(dbPath);

    const db = createSqliteDatabase(dbPath);
    const usersTable = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'users'
    `).get() as { name?: string } | undefined;
    const tokenTable = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'user_tokens'
    `).get() as { name?: string } | undefined;
    db.close();

    expect(usersTable?.name).toBe("users");
    expect(tokenTable?.name).toBe("user_tokens");
  });
});
