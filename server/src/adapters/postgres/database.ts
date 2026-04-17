import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { DatabaseSchema } from "./schema.js";

function readPostgresUri(): string {
  return process.env.POSTGRES_URI || process.env.DATABASE_URL || "";
}

export function getDefaultPostgresUri(): string {
  return readPostgresUri();
}

function resolvePostgresUri(): string {
  const postgresUri = readPostgresUri();
  if (!postgresUri) {
    throw new Error("POSTGRES_URI is not configured");
  }

  return postgresUri;
}

export function createPostgresDatabase(
  connectionString: string = resolvePostgresUri(),
): Kysely<DatabaseSchema> {
  const pool = new Pool({
    connectionString,
  });

  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool,
    }),
  });
}

export async function ensurePostgresSchema(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("lark_tenant_key", "text")
    .addColumn("lark_id", "text")
    .addColumn("lark_email", "text")
    .addColumn("lark_name", "text")
    .addColumn("lark_avatar_url", "text")
    .addColumn("role", "text")
    .addColumn("meegle_base_url", "text")
    .addColumn("meegle_user_key", "text")
    .addColumn("github_id", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("user_tokens")
    .ifNotExists()
    .addColumn("master_user_id", "text", (column) => column.notNull())
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("provider_tenant_key", "text", (column) => column.notNull())
    .addColumn("external_user_key", "text", (column) => column.notNull())
    .addColumn("base_url", "text", (column) => column.notNull())
    .addColumn("plugin_token", "text")
    .addColumn("plugin_token_expires_at", "text")
    .addColumn("user_token", "text", (column) => column.notNull())
    .addColumn("user_token_expires_at", "text")
    .addColumn("refresh_token", "text")
    .addColumn("refresh_token_expires_at", "text")
    .addColumn("credential_status", "text", (column) => column.notNull())
    .addColumn("last_auth_at", "text", (column) => column.notNull())
    .addColumn("last_refresh_at", "text")
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("user_tokens_pkey", [
      "master_user_id",
      "provider",
      "provider_tenant_key",
      "external_user_key",
      "base_url",
    ])
    .execute();

  await db.schema
    .createTable("oauth_sessions")
    .ifNotExists()
    .addColumn("state", "text", (column) => column.primaryKey())
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("master_user_id", "text")
    .addColumn("base_url", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("auth_code", "text")
    .addColumn("external_user_key", "text")
    .addColumn("error_code", "text")
    .addColumn("expires_at", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_github_id_unique
    ON users(github_id)
    WHERE github_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_lark_identity_unique
    ON users(lark_tenant_key, lark_id)
    WHERE lark_tenant_key IS NOT NULL AND lark_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_meegle_binding_unique
    ON users(meegle_base_url, meegle_user_key)
    WHERE meegle_base_url IS NOT NULL AND meegle_user_key IS NOT NULL
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS user_tokens_provider_lookup_idx
    ON user_tokens(provider, master_user_id, provider_tenant_key, external_user_key)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS oauth_sessions_provider_state_idx
    ON oauth_sessions(provider, state)
  `.execute(db);

  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS lark_name text
  `.execute(db);
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS lark_avatar_url text
  `.execute(db);
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role text
  `.execute(db);
}

export async function resetPostgresDatabase(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`DROP TABLE IF EXISTS oauth_sessions`.execute(db);
  await sql`DROP TABLE IF EXISTS user_tokens`.execute(db);
  await sql`DROP TABLE IF EXISTS users`.execute(db);
  await ensurePostgresSchema(db);
}

let sharedDatabase: Kysely<DatabaseSchema> | undefined;

export function getSharedDatabase(): Kysely<DatabaseSchema> {
  if (!sharedDatabase) {
    sharedDatabase = createPostgresDatabase();
  }

  return sharedDatabase;
}

let sharedDatabaseReady: Promise<Kysely<DatabaseSchema>> | undefined;

export async function ensureSharedDatabase(): Promise<Kysely<DatabaseSchema>> {
  if (!sharedDatabaseReady) {
    sharedDatabaseReady = (async () => {
      const db = getSharedDatabase();
      await ensurePostgresSchema(db);
      return db;
    })();
  }

  return sharedDatabaseReady;
}
