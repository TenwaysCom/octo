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

function initSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS user_identity (
      lark_id TEXT PRIMARY KEY,
      meegle_user_key TEXT,
      mapping_status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meegle_credential (
      operator_lark_id TEXT NOT NULL,
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
      PRIMARY KEY (operator_lark_id, meegle_user_key, base_url)
    );
  `);

  ensureColumn(db, "meegle_credential", "plugin_token_expires_at", "TEXT");
  ensureColumn(db, "meegle_credential", "user_token_expires_at", "TEXT");
  ensureColumn(db, "meegle_credential", "refresh_token_expires_at", "TEXT");
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
