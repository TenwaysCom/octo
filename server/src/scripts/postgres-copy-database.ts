import "dotenv/config";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getDefaultPostgresUri } from "../adapters/postgres/database.js";
import {
  backupDatabase,
  buildDatabaseUri,
  ensureDatabaseExists,
  resolveBackupFilePath,
  restoreDatabase,
} from "./postgres-backup-restore.js";

export function parseArgs(argv: string[]): {
  sourceDb: string;
  targetDb: string;
} {
  const [sourceDb, targetDb] = argv;

  if (!sourceDb || !targetDb) {
    throw new Error("Usage: <source-db> <target-db>");
  }

  return { sourceDb, targetDb };
}

export async function copyDatabase(
  postgresUri: string,
  sourceDb: string,
  targetDb: string,
): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), "pg-copy-"));
  const dumpPath = resolveBackupFilePath(tempDir, sourceDb);

  try {
    await backupDatabase(postgresUri, sourceDb, tempDir);

    const adminUri = buildDatabaseUri(postgresUri, "postgres");
    await ensureDatabaseExists(adminUri, targetDb, process.env);

    await restoreDatabase(postgresUri, targetDb, dumpPath);

    console.log(`[db] copy ${sourceDb} -> ${targetDb} completed`);
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

async function main(): Promise<void> {
  const { sourceDb, targetDb } = parseArgs(process.argv.slice(2));
  const postgresUri = getDefaultPostgresUri();

  if (!postgresUri) {
    throw new Error("POSTGRES_URI or DATABASE_URL is required");
  }

  await copyDatabase(postgresUri, sourceDb, targetDb);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  void main();
}
