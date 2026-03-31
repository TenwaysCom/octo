import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB_PATH = process.env.TENWAYS_OCTO_DB_PATH ||
  join(process.cwd(), "data", "tenways-octo.sqlite");

function ensureColumn(db: DatabaseSync, tableName: string, columnName: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function migrateUsersTable(db: DatabaseSync): void {
  const usersTable = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'users'
  `).get() as { sql?: string } | undefined;

  const schemaSql = usersTable?.sql ?? "";
  const needsRebuild =
    schemaSql.includes("meegle_user_key TEXT UNIQUE") ||
    !schemaSql.includes("meegle_base_url");

  if (!needsRebuild) {
    return;
  }

  db.exec(`
    CREATE TABLE users_v2 (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      lark_id TEXT UNIQUE,
      meegle_base_url TEXT,
      meegle_user_key TEXT,
      github_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO users_v2 (
      id,
      status,
      lark_id,
      meegle_base_url,
      meegle_user_key,
      github_id,
      created_at,
      updated_at
    )
    SELECT
      id,
      status,
      lark_id,
      NULL,
      meegle_user_key,
      github_id,
      created_at,
      updated_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_v2 RENAME TO users;
  `);
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      lark_id TEXT UNIQUE,
      meegle_base_url TEXT,
      meegle_user_key TEXT,
      github_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meegle_credential (
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
  `);

  migrateUsersTable(db);
  ensureColumn(db, "meegle_credential", "plugin_token_expires_at", "TEXT");
  ensureColumn(db, "meegle_credential", "user_token_expires_at", "TEXT");
  ensureColumn(db, "meegle_credential", "refresh_token_expires_at", "TEXT");
  ensureColumn(db, "users", "meegle_base_url", "TEXT");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_meegle_binding_unique
    ON users(meegle_base_url, meegle_user_key)
    WHERE meegle_base_url IS NOT NULL AND meegle_user_key IS NOT NULL
  `);
}

export function createSqliteDatabase(
  dbPath: string = DEFAULT_DB_PATH,
): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  initSchema(db);
  return db;
}

let sharedDatabase: DatabaseSync | undefined;

export function getSharedDatabase(): DatabaseSync {
  if (!sharedDatabase) {
    sharedDatabase = createSqliteDatabase();
  }

  return sharedDatabase;
}
