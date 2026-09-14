import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { DatabaseSchema } from "./schema.js";

export type PlatformSyncRunPlatform = "meegle" | "github" | "lark";
export type PlatformSyncRunMode = "full" | "incremental" | "clean";
export type PlatformSyncRunTrigger = "scheduled" | "manual" | "cli" | "retry";
export type PlatformSyncRunStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";

export interface PlatformSyncRun {
  runId: string;
  actionRunId: string;
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
    trigger?: PlatformSyncRunTrigger;
    actionRunId?: string;
    scheduleId?: string;
    attempt?: number;
  }): Promise<PlatformSyncRun> {
    const runId = randomUUID();
    const run: PlatformSyncRun = {
      runId,
      actionRunId: input.actionRunId ?? runId,
      startedAt: new Date().toISOString(),
    };
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
      status: "running",
      trigger: input.trigger ?? "cli",
      action_run_id: run.actionRunId,
      schedule_id: input.scheduleId ?? null,
      attempt: input.attempt ?? 1,
      heartbeat_at: run.startedAt,
      error_code: null,
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
      status: "succeeded",
      heartbeat_at: new Date().toISOString(),
      error_code: null,
    }).where("run_id", "=", runId).execute();
  }

  async completeFailure(runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.db.updateTable("platform_sync_runs").set({
      completed_at: new Date().toISOString(),
      failed: true,
      error_message: message.slice(0, 2000),
      status: "failed",
      heartbeat_at: new Date().toISOString(),
      error_code: errorCode(error),
    }).where("run_id", "=", runId).execute();
  }

  async completeSkipped(runId: string, code: string, message: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.updateTable("platform_sync_runs").set({
      completed_at: now,
      failed: false,
      status: "skipped",
      heartbeat_at: now,
      error_code: code,
      error_message: message.slice(0, 2000),
    }).where("run_id", "=", runId).execute();
  }

  async heartbeat(runId: string, now = new Date().toISOString()): Promise<void> {
    await this.db.updateTable("platform_sync_runs").set({ heartbeat_at: now })
      .where("run_id", "=", runId)
      .where("status", "=", "running")
      .execute();
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 120);
  }
  if (error instanceof Error && /^[A-Z][A-Z0-9_]+(?::|$)/.test(error.message)) {
    return error.message.split(":", 1)[0]!.slice(0, 120);
  }
  return "SYNC_FAILED";
}
