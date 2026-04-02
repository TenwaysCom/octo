import { existsSync, mkdirSync, rmSync } from "node:fs";
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

function hasColumn(db: DatabaseSync, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
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
    !schemaSql.includes("meegle_base_url") ||
    !schemaSql.includes("lark_tenant_key") ||
    schemaSql.includes("lark_id TEXT UNIQUE");

  if (!needsRebuild) {
    return;
  }

  const hasLarkTenantKey = hasColumn(db, "users", "lark_tenant_key");
  const hasMeegleBaseUrl = hasColumn(db, "users", "meegle_base_url");

  db.exec(`
    CREATE TABLE users_v2 (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      lark_tenant_key TEXT,
      lark_id TEXT,
      meegle_base_url TEXT,
      meegle_user_key TEXT,
      github_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO users_v2 (
      id,
      status,
      lark_tenant_key,
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
      ${hasLarkTenantKey ? "lark_tenant_key" : "NULL"},
      lark_id,
      ${hasMeegleBaseUrl ? "meegle_base_url" : "NULL"},
      meegle_user_key,
      github_id,
      created_at,
      updated_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_v2 RENAME TO users;
  `);
}

function migrateTokenTable(db: DatabaseSync): void {
  const tokenTable = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'user_tokens'
  `).get() as { sql?: string } | undefined;

  const hasLegacyMeegleCredential = Boolean(db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'meegle_credential'
  `).get());

  const schemaSql = tokenTable?.sql ?? "";
  const needsCreate =
    !tokenTable ||
    !schemaSql.includes("provider TEXT NOT NULL") ||
    !schemaSql.includes("external_user_key TEXT NOT NULL");
  const needsNullablePluginToken =
    Boolean(tokenTable) && schemaSql.includes("plugin_token TEXT NOT NULL");
  const needsTenantKeyRebuild =
    Boolean(tokenTable) && (
      !schemaSql.includes("provider_tenant_key TEXT NOT NULL") ||
      schemaSql.includes("PRIMARY KEY (master_user_id, provider, external_user_key, base_url)")
    );

  if (needsCreate) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        master_user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_tenant_key TEXT NOT NULL,
        external_user_key TEXT NOT NULL,
        base_url TEXT NOT NULL,
        plugin_token TEXT,
        plugin_token_expires_at TEXT,
        user_token TEXT NOT NULL,
        user_token_expires_at TEXT,
        refresh_token TEXT,
        refresh_token_expires_at TEXT,
        credential_status TEXT NOT NULL,
        last_auth_at TEXT NOT NULL,
        last_refresh_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (master_user_id, provider, provider_tenant_key, external_user_key, base_url)
      );
    `);
  } else if (needsNullablePluginToken || needsTenantKeyRebuild) {
    const hasProviderTenantKey = hasColumn(db, "user_tokens", "provider_tenant_key");
    db.exec(`
      CREATE TABLE user_tokens_v2 (
        master_user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_tenant_key TEXT NOT NULL,
        external_user_key TEXT NOT NULL,
        base_url TEXT NOT NULL,
        plugin_token TEXT,
        plugin_token_expires_at TEXT,
        user_token TEXT NOT NULL,
        user_token_expires_at TEXT,
        refresh_token TEXT,
        refresh_token_expires_at TEXT,
        credential_status TEXT NOT NULL,
        last_auth_at TEXT NOT NULL,
        last_refresh_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (master_user_id, provider, provider_tenant_key, external_user_key, base_url)
      );

      INSERT INTO user_tokens_v2 (
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
      )
      SELECT
        master_user_id,
        provider,
        ${hasProviderTenantKey ? "provider_tenant_key" : "''"},
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
      FROM user_tokens;

      DROP TABLE user_tokens;
      ALTER TABLE user_tokens_v2 RENAME TO user_tokens;
    `);
  }

  if (hasLegacyMeegleCredential) {
    const legacyIdExpression = hasColumn(db, "meegle_credential", "master_user_id")
      ? "master_user_id"
      : hasColumn(db, "meegle_credential", "operator_lark_id")
        ? `COALESCE(
            (SELECT id FROM users WHERE lark_id = meegle_credential.operator_lark_id),
            meegle_credential.operator_lark_id
          )`
        : undefined;

    if (!legacyIdExpression) {
      throw new Error("Unsupported meegle_credential schema: missing master_user_id/operator_lark_id");
    }

    db.exec(`
      INSERT OR REPLACE INTO user_tokens (
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
      )
      SELECT
        ${legacyIdExpression},
        'meegle',
        '',
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
      FROM meegle_credential;

      DROP TABLE meegle_credential;
    `);
  }
}

function initOauthSessionsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_sessions (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      master_user_id TEXT,
      base_url TEXT NOT NULL,
      status TEXT NOT NULL,
      auth_code TEXT,
      external_user_key TEXT,
      error_code TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      lark_tenant_key TEXT,
      lark_id TEXT,
      meegle_base_url TEXT,
      meegle_user_key TEXT,
      github_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  migrateUsersTable(db);
  migrateTokenTable(db);
  initOauthSessionsTable(db);
  ensureColumn(db, "user_tokens", "plugin_token_expires_at", "TEXT");
  ensureColumn(db, "user_tokens", "user_token_expires_at", "TEXT");
  ensureColumn(db, "user_tokens", "refresh_token_expires_at", "TEXT");
  ensureColumn(db, "users", "lark_tenant_key", "TEXT");
  ensureColumn(db, "users", "meegle_base_url", "TEXT");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_lark_identity_unique
    ON users(lark_tenant_key, lark_id)
    WHERE lark_tenant_key IS NOT NULL AND lark_id IS NOT NULL
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_meegle_binding_unique
    ON users(meegle_base_url, meegle_user_key)
    WHERE meegle_base_url IS NOT NULL AND meegle_user_key IS NOT NULL
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS user_tokens_provider_lookup_idx
    ON user_tokens(provider, master_user_id, provider_tenant_key, external_user_key)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS oauth_sessions_provider_state_idx
    ON oauth_sessions(provider, state)
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

export function getDefaultDatabasePath(): string {
  return DEFAULT_DB_PATH;
}

export function resetSqliteDatabase(
  dbPath: string = DEFAULT_DB_PATH,
): DatabaseSync {
  if (dbPath !== ":memory:" && existsSync(dbPath)) {
    rmSync(dbPath, { force: true });
  }

  return createSqliteDatabase(dbPath);
}

let sharedDatabase: DatabaseSync | undefined;

export function getSharedDatabase(): DatabaseSync {
  if (!sharedDatabase) {
    sharedDatabase = createSqliteDatabase();
  }

  return sharedDatabase;
}
