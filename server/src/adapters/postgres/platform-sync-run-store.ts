import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { DatabaseSchema } from "./schema.js";

export type PlatformSyncRunPlatform = "meegle" | "github" | "lark";
export type PlatformSyncRunMode = "full" | "incremental" | "clean";

export interface PlatformSyncRun {
  runId: string;
  startedAt: string;
}

export interface PlatformSyncRunCounts {
  listed: number;
  skippedInactive: number;
  synced: number;
  cleaned?: number;
  stale?: number;
}

export class PostgresPlatformSyncRunStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async start(input: {
    platform: PlatformSyncRunPlatform;
    scopeKey: string;
    mode: PlatformSyncRunMode;
    cleanAfterSync: boolean;
  }): Promise<PlatformSyncRun> {
    const run: PlatformSyncRun = { runId: randomUUID(), startedAt: new Date().toISOString() };
    await this.db.insertInto("platform_sync_runs").values({
      run_id: run.runId,
      platform: input.platform,
      scope_key: input.scopeKey,
      mode: input.mode,
      clean_after_sync: input.cleanAfterSync,
      started_at: run.startedAt,
      completed_at: null,
      listed: null,
      skipped_inactive: null,
      synced: null,
      cleaned: null,
      stale: null,
      failed: null,
      error_message: null,
    }).execute();
    return run;
  }

  async completeSuccess(runId: string, counts: PlatformSyncRunCounts): Promise<void> {
    await this.db.updateTable("platform_sync_runs").set({
      completed_at: new Date().toISOString(),
      listed: counts.listed,
      skipped_inactive: counts.skippedInactive,
      synced: counts.synced,
      cleaned: counts.cleaned ?? 0,
      stale: counts.stale ?? 0,
      failed: false,
      error_message: null,
    }).where("run_id", "=", runId).execute();
  }

  async completeFailure(runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.db.updateTable("platform_sync_runs").set({
      completed_at: new Date().toISOString(),
      failed: true,
      error_message: message.slice(0, 2000),
    }).where("run_id", "=", runId).execute();
  }
}
