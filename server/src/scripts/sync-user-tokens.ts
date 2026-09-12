import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { config } from "dotenv";
import type { Kysely, Selectable } from "kysely";

import {
  createPostgresDatabase,
  getDefaultPostgresUri,
} from "../adapters/postgres/database.js";
import type { DatabaseSchema } from "../adapters/postgres/schema.js";
import { preparePostgresConnection } from "../adapters/postgres/ssh-tunnel.js";
import { buildDatabaseUri } from "./postgres-backup-restore.js";

config({ path: new URL("../../.env", import.meta.url), quiet: true });
config({ quiet: true });

const DEFAULT_SOURCE_DATABASE = "tenways_octo";
const DEFAULT_MASTER_USER_ID = "a400632e-8d08-4ddf-977d-e8330b0adc5a";

type UserTokenRow = Selectable<DatabaseSchema["user_tokens"]>;

export interface SyncUserTokensArgs {
  masterUserId: string;
  sourceDatabase: string;
  targetDatabase: string;
  postgresUri: string;
  provider?: string;
}

export interface SyncedTokenExpiry {
  provider: string;
  providerTenantKey: string;
  externalUserKey: string;
  baseUrl: string;
  pluginTokenExpiresAt: string | null;
  userTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  updatedAt: string;
}

export interface SyncUserTokensResult {
  copiedRows: number;
  deletedRows: string;
  expiries: SyncedTokenExpiry[];
}

export function parseArgs(argv: string[]): SyncUserTokensArgs {
  const rest = [...argv];
  let masterUserId = DEFAULT_MASTER_USER_ID;

  if (rest[0] && !rest[0].startsWith("--")) {
    masterUserId = rest.shift() ?? DEFAULT_MASTER_USER_ID;
  }

  if (!masterUserId) {
    throw new Error(
      "Usage: sync-user-tokens [master-user-id] [--source-db tenways_octo] [--target-db tenways_octo_ly_0509] [--provider lark] [--postgres-uri <uri>]",
    );
  }

  let sourceDatabase = DEFAULT_SOURCE_DATABASE;
  let targetDatabase: string | undefined;
  let postgresUri = getDefaultPostgresUri();
  let provider: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = rest[index + 1];

    if (arg === "--source-db") {
      if (!next) {
        throw new Error("Missing value for --source-db");
      }
      sourceDatabase = next;
      index += 1;
      continue;
    }

    if (arg === "--target-db") {
      if (!next) {
        throw new Error("Missing value for --target-db");
      }
      targetDatabase = next;
      index += 1;
      continue;
    }

    if (arg === "--postgres-uri") {
      if (!next) {
        throw new Error("Missing value for --postgres-uri");
      }
      postgresUri = next;
      index += 1;
      continue;
    }

    if (arg === "--provider") {
      if (!next) {
        throw new Error("Missing value for --provider");
      }
      provider = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!postgresUri) {
    throw new Error("POSTGRES_URI or DATABASE_URL is required");
  }

  if (!targetDatabase) {
    targetDatabase = new URL(postgresUri).pathname.replace(/^\//, "");
    if (!targetDatabase) {
      throw new Error("POSTGRES_URI or DATABASE_URL must include a target database name");
    }
  }

  return {
    masterUserId,
    sourceDatabase,
    targetDatabase,
    postgresUri,
    ...(provider ? { provider } : {}),
  };
}

function toExpiry(row: UserTokenRow): SyncedTokenExpiry {
  return {
    provider: row.provider,
    providerTenantKey: row.provider_tenant_key,
    externalUserKey: row.external_user_key,
    baseUrl: row.base_url,
    pluginTokenExpiresAt: row.plugin_token_expires_at,
    userTokenExpiresAt: row.user_token_expires_at,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    updatedAt: row.updated_at,
  };
}

export async function syncUserTokens(
  sourceDb: Kysely<DatabaseSchema>,
  targetDb: Kysely<DatabaseSchema>,
  masterUserId: string,
  provider?: string,
): Promise<SyncUserTokensResult> {
  let sourceQuery = sourceDb
    .selectFrom("user_tokens")
    .selectAll()
    .where("master_user_id", "=", masterUserId)
    .orderBy("updated_at", "desc");

  if (provider) {
    sourceQuery = sourceQuery.where("provider", "=", provider);
  }

  const sourceRows = await sourceQuery.execute();

  if (sourceRows.length === 0) {
    throw new Error(`No user_tokens rows found in source database for master_user_id=${masterUserId}`);
  }

  const result = await targetDb.transaction().execute(async (trx) => {
    let deleteResult = trx
      .deleteFrom("user_tokens")
      .where("master_user_id", "=", masterUserId);

    if (provider) {
      deleteResult = deleteResult.where("provider", "=", provider);
    }

    const deleted = await deleteResult.executeTakeFirst();

    await trx.insertInto("user_tokens").values(sourceRows).execute();

    return {
      copiedRows: sourceRows.length,
      deletedRows: deleted.numDeletedRows.toString(),
      expiries: sourceRows.map(toExpiry),
    };
  });

  return result;
}

function printResult(args: SyncUserTokensArgs, result: SyncUserTokensResult): void {
  console.log(
    `[db] synced user_tokens master_user_id=${args.masterUserId} provider=${args.provider ?? "all"} source=${args.sourceDatabase} target=${args.targetDatabase} copied=${result.copiedRows} deleted=${result.deletedRows}`,
  );
  console.log("[db] synced token expiries:");

  for (const expiry of result.expiries) {
    console.log(
      [
        `  provider=${expiry.provider}`,
        `tenant=${expiry.providerTenantKey || "-"}`,
        `external_user_key=${expiry.externalUserKey || "-"}`,
        `base_url=${expiry.baseUrl || "-"}`,
        `user_token_expires_at=${expiry.userTokenExpiresAt ?? "-"}`,
        `plugin_token_expires_at=${expiry.pluginTokenExpiresAt ?? "-"}`,
        `refresh_token_expires_at=${expiry.refreshTokenExpiresAt ?? "-"}`,
        `updated_at=${expiry.updatedAt}`,
      ].join(" "),
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const connection = await preparePostgresConnection(args.postgresUri);
  const sourceDb = createPostgresDatabase(buildDatabaseUri(connection.postgresUri, args.sourceDatabase));
  const targetDb = createPostgresDatabase(buildDatabaseUri(connection.postgresUri, args.targetDatabase));

  try {
    const result = await syncUserTokens(sourceDb, targetDb, args.masterUserId, args.provider);
    printResult(args, result);
  } finally {
    await sourceDb.destroy();
    await targetDb.destroy();
    await connection.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
