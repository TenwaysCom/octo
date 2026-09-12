import { PostgresPlatformSyncLeaseStore } from "./platform-sync-lease-store.js";
import { PostgresPlatformSyncRunStore } from "./platform-sync-run-store.js";
import { PostgresPlatformSyncScheduleStore } from "./platform-sync-schedule-store.js";
import { PostgresPlatformSyncStatusStore } from "./platform-sync-status-store.js";
import { PostgresPlatformSyncStore } from "./platform-sync-store.js";
import { createTestPostgresDatabase } from "./test-db.js";

describe("PostgresPlatformSyncStatusStore", () => {
  it("projects the configured schedule and latest run without exposing raw errors", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const scheduleStore = new PostgresPlatformSyncScheduleStore(db);
    await scheduleStore.reconcileConfigSchedules([{
      scheduleId: "github:acme/app",
      platform: "github",
      scopeKey: "acme/app",
      intervalSeconds: 600,
      target: { platform: "github", owner: "acme", repo: "app" },
    }], "2026-08-26T00:00:00.000Z");
    const runStore = new PostgresPlatformSyncRunStore(db);
    await new PostgresPlatformSyncStore(db).upsertGitHubPullRequest({
      owner: "acme",
      repo: "app",
      pullRequest: {
        number: 1,
        title: "Synced PR",
        body: null,
        html_url: "https://github.com/acme/app/pull/1",
        state: "open",
        merged_at: null,
        updated_at: "2026-08-25T00:01:00.000Z",
        draft: false,
      },
    });
    const run = await runStore.start({
      platform: "github",
      scopeKey: "acme/app",
      mode: "incremental",
      cleanAfterSync: true,
      trigger: "scheduled",
    });
    await runStore.completeFailure(run.runId, new Error("PLATFORM_RATE_LIMITED:raw detail"));

    await expect(new PostgresPlatformSyncStatusStore(db).list([
      { platform: "github", scopeKey: "acme/app" },
    ])).resolves.toEqual([expect.objectContaining({
      platform: "github",
      scopeKey: "acme/app",
      scheduled: true,
      nextRunAt: "2026-08-26T00:00:00.000Z",
      runStatus: "failed",
      runTrigger: "scheduled",
      lastSyncedAt: expect.any(String),
      lastErrorCode: "PLATFORM_RATE_LIMITED",
    })]);

    await db.destroy();
    await pool.end();
  });

  it("keeps an active leased run visible when a newer duplicate attempt is skipped", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const runStore = new PostgresPlatformSyncRunStore(db);
    const activeRun = await runStore.start({
      platform: "github",
      scopeKey: "acme/app",
      mode: "incremental",
      cleanAfterSync: true,
      trigger: "scheduled",
    });
    await new PostgresPlatformSyncLeaseStore(db).acquire({
      platform: "github",
      scopeKey: "acme/app",
      runId: activeRun.runId,
      leaseDurationMs: 60_000,
    });
    const duplicateRun = await runStore.start({
      platform: "github",
      scopeKey: "acme/app",
      mode: "incremental",
      cleanAfterSync: true,
      trigger: "manual",
    });
    await runStore.completeSkipped(duplicateRun.runId, "SYNC_ALREADY_RUNNING", "already running");

    await expect(new PostgresPlatformSyncStatusStore(db).list([
      { platform: "github", scopeKey: "acme/app" },
    ])).resolves.toEqual([expect.objectContaining({
      runStatus: "running",
      runTrigger: "scheduled",
      lastRunAt: activeRun.startedAt,
      lastErrorCode: undefined,
    })]);

    await db.destroy();
    await pool.end();
  });
});
