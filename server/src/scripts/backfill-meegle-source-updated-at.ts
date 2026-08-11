import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveMeegleSourceUpdatedAt } from "../adapters/meegle/meegle-source-updated-at.js";
import { PostgresPlatformSyncCheckpointStore } from "../adapters/postgres/platform-sync-checkpoint-store.js";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";

export interface BackfillMeegleSourceUpdatedAtArgs {
  apply: boolean;
}

export function parseArgs(argv: string[]): BackfillMeegleSourceUpdatedAtArgs {
  if (argv.length === 0) return { apply: false };
  if (argv.length === 1 && argv[0] === "--apply") return { apply: true };
  throw new Error("Usage: pnpm --dir server platform:backfill-meegle-source-time [--apply]");
}

type MeegleHistoricalSnapshot = {
  project_key: string;
  work_item_type_key: string;
  work_item_id: string;
  payload_json: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = await ensureSharedDatabase();
  try {
    const snapshots = await db.selectFrom("meegle_workitem_syncs")
      .select(["project_key", "work_item_type_key", "work_item_id", "payload_json"])
      .where("source_updated_at", "is", null)
      .execute();
    const candidates = extractCandidates(snapshots);
    let updated = 0;
    let initializedCheckpoints = 0;

    if (args.apply && candidates.valid.length > 0) {
      await db.transaction().execute(async (transaction) => {
        for (const candidate of candidates.valid) {
          await transaction.updateTable("meegle_workitem_syncs").set({ source_updated_at: candidate.sourceUpdatedAt })
            .where("project_key", "=", candidate.projectKey)
            .where("work_item_type_key", "=", candidate.workItemTypeKey)
            .where("work_item_id", "=", candidate.workItemId)
            .where("source_updated_at", "is", null)
            .execute();
        }
      });
      updated = candidates.valid.length;

      const checkpointStore = new PostgresPlatformSyncCheckpointStore(db);
      const checkpoints = (await checkpointStore.listInitialCheckpoints()).filter((checkpoint) => checkpoint.platform === "meegle");
      initializedCheckpoints = (await Promise.all(checkpoints.map((checkpoint) => (
        checkpointStore.initializeMissingWatermark(checkpoint)
      )))).filter(Boolean).length;
    }

    process.stdout.write(`[meegle-source-time] ${JSON.stringify({
      apply: args.apply,
      candidates: snapshots.length,
      valid: candidates.valid.length,
      invalid: candidates.invalid,
      scopes: candidates.scopes,
      updated,
      initializedCheckpoints,
    })}\n`);
  } finally {
    await closeSharedDatabase();
  }
}

export function extractCandidates(snapshots: MeegleHistoricalSnapshot[]) {
  const valid: Array<{ projectKey: string; workItemTypeKey: string; workItemId: string; sourceUpdatedAt: string }> = [];
  const scopes = new Map<string, { candidates: number; valid: number; invalid: number }>();
  let invalid = 0;
  for (const snapshot of snapshots) {
    const entry = scopes.get(snapshot.project_key) ?? { candidates: 0, valid: 0, invalid: 0 };
    entry.candidates += 1;
    try {
      const payload = JSON.parse(snapshot.payload_json) as { type?: unknown; fields?: unknown; updatedAt?: unknown };
      const sourceUpdatedAt = resolveMeegleSourceUpdatedAt({
        workItemTypeKey: typeof payload.type === "string" ? payload.type : snapshot.work_item_type_key,
        fields: asRecord(payload.fields) ?? {},
        updatedAt: payload.updatedAt,
      });
      if (sourceUpdatedAt) {
        valid.push({
          projectKey: snapshot.project_key,
          workItemTypeKey: snapshot.work_item_type_key,
          workItemId: snapshot.work_item_id,
          sourceUpdatedAt,
        });
        entry.valid += 1;
      } else {
        invalid += 1;
        entry.invalid += 1;
      }
    } catch {
      invalid += 1;
      entry.invalid += 1;
    }
    scopes.set(snapshot.project_key, entry);
  }
  return {
    valid,
    invalid,
    scopes: Array.from(scopes, ([scope, counts]) => ({ scope, ...counts })).sort((left, right) => left.scope.localeCompare(right.scope)),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[meegle-source-time] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
