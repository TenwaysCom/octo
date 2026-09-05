import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PostgresPlatformSyncCheckpointStore } from "../adapters/postgres/platform-sync-checkpoint-store.js";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";

const OVERLAP_MS = 5 * 60 * 1000;

export interface ResetLarkIncrementalCheckpointArgs {
  apply: boolean;
  scope: string;
  at?: string;
}

export function parseArgs(argv: string[]): ResetLarkIncrementalCheckpointArgs {
  const args: Partial<ResetLarkIncrementalCheckpointArgs> = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }
    if (arg === "--scope" || arg === "--at") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--scope") args.scope = value;
      else args.at = value;
      index += 1;
      continue;
    }
    throw new Error("Usage: pnpm --dir server platform:reset-lark-incremental --scope BASE_ID/TABLE_ID [--at ISO_TIMESTAMP] [--apply]");
  }
  if (!args.scope || !isLarkScope(args.scope)) {
    throw new Error("--scope must be an exact Lark BASE_ID/TABLE_ID value");
  }
  if (args.at && Number.isNaN(new Date(args.at).getTime())) {
    throw new Error("--at must be a valid ISO timestamp");
  }
  return args as ResetLarkIncrementalCheckpointArgs;
}

export function larkIncrementalStartWatermark(now = new Date()): string {
  return new Date(now.getTime() - OVERLAP_MS).toISOString();
}

function isLarkScope(scope: string): boolean {
  const [baseId, tableId, ...rest] = scope.split("/");
  return Boolean(baseId && tableId && rest.length === 0);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const watermarkUpdatedAt = args.at ?? larkIncrementalStartWatermark();
  if (args.apply) {
    const db = await ensureSharedDatabase();
    try {
      await new PostgresPlatformSyncCheckpointStore(db)
        .resetWatermark("lark", args.scope, watermarkUpdatedAt, "");
    } finally {
      await closeSharedDatabase();
    }
  }
  process.stdout.write(`[lark-incremental-reset] ${JSON.stringify({ scope: args.scope, watermarkUpdatedAt, apply: args.apply })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[lark-incremental-reset] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
