import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PlatformSyncService } from "../application/services/platform-sync.service.js";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";
import { PostgresPlatformSyncStore } from "../adapters/postgres/platform-sync-store.js";

const PLATFORM_NAMES = ["github", "lark"] as const;
type PlatformName = typeof PLATFORM_NAMES[number];

export interface CleanPlatformSyncSnapshotsArgs {
  apply: boolean;
  only?: PlatformName;
}

export function parseArgs(argv: string[]): CleanPlatformSyncSnapshotsArgs {
  const args: CleanPlatformSyncSnapshotsArgs = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }
    if (arg === "--only") {
      const value = argv[index + 1];
      if (!value || !PLATFORM_NAMES.includes(value as PlatformName)) {
        throw new Error("Usage: pnpm --dir server platform:clean-history [--only github|lark] [--apply]");
      }
      args.only = value as PlatformName;
      index += 1;
      continue;
    }
    throw new Error("Usage: pnpm --dir server platform:clean-history [--only github|lark] [--apply]");
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = await ensureSharedDatabase();
  try {
    const store = new PostgresPlatformSyncStore(db);
    const service = new PlatformSyncService({ store });
    const results: Array<Record<string, unknown>> = [];

    if (!args.only || args.only === "github") {
      const refs = await db.selectFrom("github_pr_syncs")
        .select(["owner", "repo", "pull_number"])
        .orderBy("owner")
        .orderBy("repo")
        .orderBy("pull_number")
        .execute();
      const cleaned = args.apply ? await service.cleanGitHubPullRequests(refs.map((row) => ({
        owner: row.owner,
        repo: row.repo,
        pullNumber: row.pull_number,
      }))) : 0;
      results.push({ platform: "github", candidates: refs.length, apply: args.apply, cleaned, targetTable: "github_pr_syncs" });
    }

    if (!args.only || args.only === "lark") {
      const refs = await db.selectFrom("lark_base_ticket_syncs")
        .select(["base_id", "table_id", "record_id"])
        .orderBy("base_id")
        .orderBy("table_id")
        .orderBy("record_id")
        .execute();
      const cleaned = args.apply ? await service.cleanLarkBaseTickets(refs.map((row) => ({
        baseId: row.base_id,
        tableId: row.table_id,
        recordId: row.record_id,
      }))) : 0;
      results.push({ platform: "lark", candidates: refs.length, apply: args.apply, cleaned, targetTable: "lark_base_ticket_syncs" });
    }

    process.stdout.write(`[platform-sync-clean] ${JSON.stringify({ results })}\n`);
  } finally {
    await closeSharedDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[platform-sync-clean] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
