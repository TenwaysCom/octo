import "dotenv/config";
import { mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { getDefaultPostgresUri } from "../adapters/postgres/database.js";

type Command = "backup" | "restore";

export function parseArgs(argv: string[]): {
  command: Command;
  databaseName: string;
  filePath?: string;
  backupDir?: string;
} {
  const [command, databaseName, ...rest] = argv;

  if (command !== "backup" && command !== "restore") {
    throw new Error("Usage: <backup|restore> <database-name> [--file <path>] [--dir <path>]");
  }

  if (!databaseName) {
    throw new Error("Database name is required");
  }

  let filePath: string | undefined;
  let backupDir: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = rest[index + 1];

    if (arg === "--file") {
      if (!next) {
        throw new Error("Missing value for --file");
      }
      filePath = next;
      index += 1;
      continue;
    }

    if (arg === "--dir") {
      if (!next) {
        throw new Error("Missing value for --dir");
      }
      backupDir = next;
      index += 1;
      continue;
    }
  }

  return {
    command,
    databaseName,
    filePath,
    backupDir,
  };
}

export function buildDatabaseUri(baseUri: string, databaseName: string): string {
  const url = new URL(baseUri);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

export function resolveBackupFilePath(
  backupDir: string,
  databaseName: string,
  now = new Date(),
): string {
  return join(backupDir, `${databaseName}-${formatTimestamp(now)}.dump`);
}

function findLatestBackupFile(backupDir: string, databaseName: string): string {
  if (!existsSync(backupDir)) {
    throw new Error(`Backup directory does not exist: ${backupDir}`);
  }

  const files = readdirSync(backupDir)
    .filter((name) => name.startsWith(`${databaseName}-`) && name.endsWith(".dump"))
    .map((name) => ({
      path: join(backupDir, name),
      mtimeMs: statSync(join(backupDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (files.length === 0) {
    throw new Error(`No backup file found for database: ${databaseName}`);
  }

  return files[0].path;
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}

async function ensureDatabaseExists(adminUri: string, databaseName: string, env: NodeJS.ProcessEnv) {
  const sql = `SELECT 1 FROM pg_database WHERE datname = '${databaseName.replace(/'/g, "''")}';`;
  let exists = false;

  await new Promise<void>((resolve, reject) => {
    let stdout = "";
    const child = spawn("psql", [adminUri, "-Atc", sql], {
      env,
    });

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.pipe(process.stderr);

    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`psql exited with code ${code ?? "unknown"}`));
        return;
      }

      exists = stdout.trim() === "1";
      resolve();
    });

    child.on("error", reject);
  });

  if (!exists) {
    await runCommand("createdb", [adminUri, databaseName], env);
  }
}

async function backupDatabase(postgresUri: string, databaseName: string, backupDir: string) {
  mkdirSync(backupDir, { recursive: true });
  const filePath = resolveBackupFilePath(backupDir, databaseName);
  const sourceUri = buildDatabaseUri(postgresUri, databaseName);

  console.log(`[db] backing up ${databaseName} -> ${filePath}`);
  await runCommand("pg_dump", [sourceUri, "-Fc", "-f", filePath], process.env);
  console.log(`[db] backup completed: ${filePath}`);
}

async function restoreDatabase(
  postgresUri: string,
  databaseName: string,
  filePath: string,
) {
  const targetUri = buildDatabaseUri(postgresUri, databaseName);
  const adminUri = buildDatabaseUri(postgresUri, "postgres");

  await ensureDatabaseExists(adminUri, databaseName, process.env);

  console.log(`[db] restoring ${basename(filePath)} -> ${databaseName}`);
  await runCommand(
    "pg_restore",
    ["-d", targetUri, "--clean", "--if-exists", "--no-owner", "--no-privileges", filePath],
    process.env,
  );
  console.log(`[db] restore completed: ${databaseName}`);
}

async function main(): Promise<void> {
  const { command, databaseName, filePath, backupDir } = parseArgs(process.argv.slice(2));
  const postgresUri = getDefaultPostgresUri();

  if (!postgresUri) {
    throw new Error("POSTGRES_URI or DATABASE_URL is required");
  }

  const resolvedBackupDir = resolve(backupDir ?? "backups/postgres");

  if (command === "backup") {
    await backupDatabase(postgresUri, databaseName, resolvedBackupDir);
    return;
  }

  const restoreFile = filePath ? resolve(filePath) : findLatestBackupFile(resolvedBackupDir, databaseName);
  await restoreDatabase(postgresUri, databaseName, restoreFile);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  void main();
}
