import "dotenv/config";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { Kysely } from "kysely";
import {
  createPostgresDatabase,
  ensurePostgresSchema,
  getDefaultPostgresUri,
} from "../adapters/postgres/database.js";
import type { DatabaseSchema } from "../adapters/postgres/schema.js";
import { getDefaultDatabasePath } from "../adapters/sqlite/database.js";

interface ImportOptions {
  sqlitePath: string;
  db: Kysely<DatabaseSchema>;
}

interface UserRow {
  id: string;
  status: string;
  lark_tenant_key: string | null;
  lark_id: string | null;
  lark_email: string | null;
  meegle_base_url: string | null;
  meegle_user_key: string | null;
  github_id: string | null;
  created_at: string;
  updated_at: string;
}

interface UserTokenRow {
  master_user_id: string;
  provider: string;
  provider_tenant_key: string;
  external_user_key: string;
  base_url: string;
  plugin_token: string | null;
  plugin_token_expires_at: string | null;
  user_token: string;
  user_token_expires_at: string | null;
  refresh_token: string | null;
  refresh_token_expires_at: string | null;
  credential_status: string;
  last_auth_at: string;
  last_refresh_at: string | null;
  updated_at: string;
}

interface OauthSessionRow {
  state: string;
  provider: string;
  master_user_id: string | null;
  base_url: string;
  status: string;
  auth_code: string | null;
  external_user_key: string | null;
  error_code: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export async function importSqliteDataToPostgres(
  options: ImportOptions,
): Promise<{
  users: number;
  userTokens: number;
  oauthSessions: number;
}> {
  if (!existsSync(options.sqlitePath)) {
    throw new Error(`SQLite database does not exist at ${options.sqlitePath}`);
  }

  const sqliteDb = new DatabaseSync(options.sqlitePath, {
    open: true,
  });

  try {
    const users = sqliteDb.prepare(`
      SELECT id, status, lark_tenant_key, lark_id, lark_email, meegle_base_url, meegle_user_key, github_id, created_at, updated_at
      FROM users
    `).all() as unknown as UserRow[];

    const userTokens = sqliteDb.prepare(`
      SELECT master_user_id, provider, provider_tenant_key, external_user_key, base_url, plugin_token, plugin_token_expires_at, user_token, user_token_expires_at, refresh_token, refresh_token_expires_at, credential_status, last_auth_at, last_refresh_at, updated_at
      FROM user_tokens
    `).all() as unknown as UserTokenRow[];

    const oauthSessions = sqliteDb.prepare(`
      SELECT state, provider, master_user_id, base_url, status, auth_code, external_user_key, error_code, expires_at, created_at, updated_at
      FROM oauth_sessions
    `).all() as unknown as OauthSessionRow[];

    await options.db.transaction().execute(async (trx) => {
      for (const user of users) {
        await trx.insertInto("users").values(user).onConflict((conflict) => conflict.column("id").doUpdateSet(user)).execute();
      }

      for (const token of userTokens) {
        await trx.insertInto("user_tokens").values(token).onConflict((conflict) => conflict.columns([
          "master_user_id",
          "provider",
          "provider_tenant_key",
          "external_user_key",
          "base_url",
        ]).doUpdateSet(token)).execute();
      }

      for (const session of oauthSessions) {
        await trx.insertInto("oauth_sessions").values(session).onConflict((conflict) => conflict.column("state").doUpdateSet(session)).execute();
      }
    });

    return {
      users: users.length,
      userTokens: userTokens.length,
      oauthSessions: oauthSessions.length,
    };
  } finally {
    sqliteDb.close();
  }
}

function parseArgs(argv: string[]): { sqlitePath: string; postgresUri: string } {
  let sqlitePath = getDefaultDatabasePath();
  let postgresUri = getDefaultPostgresUri();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if ((arg === "--sqlite" || arg === "--sqlite-path") && next) {
      sqlitePath = next;
      index += 1;
      continue;
    }

    if ((arg === "--pg" || arg === "--postgres-uri") && next) {
      postgresUri = next;
      index += 1;
    }
  }

  return {
    sqlitePath,
    postgresUri,
  };
}

async function main(): Promise<void> {
  const { sqlitePath, postgresUri } = parseArgs(process.argv.slice(2));
  const db = createPostgresDatabase(postgresUri);

  try {
    await ensurePostgresSchema(db);
    const result = await importSqliteDataToPostgres({
      sqlitePath,
      db,
    });

    console.log(`[db] imported sqlite data from ${sqlitePath}`);
    console.log(`[db] users=${result.users} user_tokens=${result.userTokens} oauth_sessions=${result.oauthSessions}`);
  } finally {
    await db.destroy();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
