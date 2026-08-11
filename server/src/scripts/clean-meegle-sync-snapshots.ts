import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PlatformSyncService } from "../application/services/platform-sync.service.js";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";
import { PostgresPlatformSyncStore } from "../adapters/postgres/platform-sync-store.js";

const PROJECT_KEY = "4c3fv6";

export function parseArgs(argv: string[]): { apply: boolean } {
  if (argv.length === 0) return { apply: false };
  if (argv.length === 1 && argv[0] === "--apply") return { apply: true };
  throw new Error("Usage: pnpm --dir server platform:clean-meegle [--apply]");
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  const db = await ensureSharedDatabase();
  try {
    const refs = await db.selectFrom("meegle_workitem_syncs")
      .select(["project_key", "work_item_type_key", "work_item_id"])
      .where("project_key", "=", PROJECT_KEY)
      .orderBy("work_item_type_key")
      .orderBy("work_item_id")
      .execute();
    const cleaned = apply
      ? await new PlatformSyncService({ store: new PostgresPlatformSyncStore(db) }).cleanMeegleWorkitems(refs.map((row) => ({
        projectKey: row.project_key,
        workItemTypeKey: row.work_item_type_key,
        workItemId: row.work_item_id,
      })))
      : 0;
    process.stdout.write(`[meegle-cleanup] ${JSON.stringify({
      project_key: PROJECT_KEY,
      candidate_rows: refs.length,
      apply,
      cleaned,
      target_table: "meegle_workitem_syncs",
    })}\n`);
  } finally {
    await closeSharedDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[meegle-cleanup] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
