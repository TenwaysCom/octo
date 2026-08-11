import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PLATFORM_SYNC_PLATFORMS,
  PostgresPlatformSyncCheckpointStore,
  type PlatformSyncPlatform,
} from "../adapters/postgres/platform-sync-checkpoint-store.js";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";

export interface BackfillPlatformSyncCheckpointsArgs {
  apply: boolean;
  only?: PlatformSyncPlatform;
}

export function parseArgs(argv: string[]): BackfillPlatformSyncCheckpointsArgs {
  const args: BackfillPlatformSyncCheckpointsArgs = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }
    if (arg === "--only") {
      const value = argv[index + 1];
      if (!value || !PLATFORM_SYNC_PLATFORMS.includes(value as PlatformSyncPlatform)) {
        throw new Error("Usage: pnpm --dir server platform:init-checkpoints [--only github|lark|meegle] [--apply]");
      }
      args.only = value as PlatformSyncPlatform;
      index += 1;
      continue;
    }
    throw new Error("Usage: pnpm --dir server platform:init-checkpoints [--only github|lark|meegle] [--apply]");
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = await ensureSharedDatabase();
  try {
    const store = new PostgresPlatformSyncCheckpointStore(db);
    const candidates = (await store.listInitialCheckpoints())
      .filter((checkpoint) => !args.only || checkpoint.platform === args.only);
    const created = args.apply
      ? (await Promise.all(candidates.map((checkpoint) => store.createIfMissing(checkpoint)))).filter(Boolean).length
      : 0;
    process.stdout.write(`[platform-sync-checkpoint] ${JSON.stringify({ candidates, apply: args.apply, created })}\n`);
  } finally {
    await closeSharedDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[platform-sync-checkpoint] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
