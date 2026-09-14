import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PlatformSyncService } from "../application/services/platform-sync.service.js";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";
import { PostgresPlatformSyncStore } from "../adapters/postgres/platform-sync-store.js";

export function parseArgs(argv: string[]): { apply: boolean } {
  if (argv.length === 0) return { apply: false };
  if (argv.length === 1 && argv[0] === "--apply") return { apply: true };
  throw new Error("Usage: pnpm --dir server platform:init-sprint-memberships [--apply]");
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  const db = await ensureSharedDatabase();
  try {
    const result = await new PlatformSyncService({ store: new PostgresPlatformSyncStore(db) })
      .initMeegleSprintMembershipHistory({ apply });
    process.stdout.write(`[meegle-membership-init] ${JSON.stringify({
      apply,
      ...result,
      target_table: "meegle_workitem_sprint_memberships",
    })}\n`);
  } finally {
    await closeSharedDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[meegle-membership-init] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
