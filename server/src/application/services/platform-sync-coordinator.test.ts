import { PostgresPlatformSyncCheckpointStore } from "../../adapters/postgres/platform-sync-checkpoint-store.js";
import { PostgresPlatformSyncLeaseStore } from "../../adapters/postgres/platform-sync-lease-store.js";
import { PostgresPlatformSyncRunStore } from "../../adapters/postgres/platform-sync-run-store.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import { PlatformSyncCoordinator, PlatformSyncCoordinatorError } from "./platform-sync-coordinator.js";

describe("PlatformSyncCoordinator", () => {
  it("audits a successful run and advances its checkpoint with CAS", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const checkpointStore = new PostgresPlatformSyncCheckpointStore(db);
    const coordinator = new PlatformSyncCoordinator({
      checkpointStore,
      runStore: new PostgresPlatformSyncRunStore(db),
      leaseStore: new PostgresPlatformSyncLeaseStore(db),
    });
    await checkpointStore.createIfMissing({
      platform: "github",
      scopeKey: "acme/app",
      watermarkUpdatedAt: "2026-08-26T00:00:00.000Z",
      watermarkTiebreaker: "000000000001",
    });

    const result = await coordinator.runIncremental({
      platform: "github",
      scopeKey: "acme/app",
      trigger: "manual",
      actionRunId: "action-1",
      execute: async (checkpoint, context) => {
        expect(checkpoint.watermarkUpdatedAt).toBe("2026-08-26T00:00:00.000Z");
        expect(context.actionRunId).toBe("action-1");
        return {
          listed: 2,
          skippedInactive: 0,
          synced: 2,
          cleaned: 2,
          watermarkUpdatedAt: "2026-08-26T00:02:00.000Z",
          watermarkTiebreaker: "000000000002",
        };
      },
    });

    expect(result).toEqual(expect.objectContaining({ actionRunId: "action-1", synced: 2 }));
    await expect(checkpointStore.get("github", "acme/app")).resolves.toEqual(expect.objectContaining({
      watermarkUpdatedAt: "2026-08-26T00:02:00.000Z",
      version: 1,
    }));
    await expect(db.selectFrom("platform_sync_runs").select(["status", "trigger", "action_run_id"])
      .where("run_id", "=", result.runId).executeTakeFirst()).resolves.toEqual({
        status: "succeeded",
        trigger: "manual",
        action_run_id: "action-1",
      });
    await expect(db.selectFrom("platform_sync_leases").selectAll().execute()).resolves.toEqual([]);

    await db.destroy();
    await pool.end();
  });

  it("keeps the previous checkpoint when incremental cleaning fails", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const checkpointStore = new PostgresPlatformSyncCheckpointStore(db);
    const coordinator = new PlatformSyncCoordinator({
      checkpointStore,
      runStore: new PostgresPlatformSyncRunStore(db),
      leaseStore: new PostgresPlatformSyncLeaseStore(db),
    });
    await checkpointStore.createIfMissing({
      platform: "meegle",
      scopeKey: "project/story",
      watermarkUpdatedAt: "2026-08-26T00:00:00.000Z",
      watermarkTiebreaker: "story:1",
    });

    await expect(coordinator.runIncremental({
      platform: "meegle",
      scopeKey: "project/story",
      trigger: "manual",
      execute: async () => { throw new Error("PLATFORM_SYNC_CLEANING_FAILED:meegle:1/1"); },
    })).rejects.toMatchObject({ code: "SYNC_FAILED" });

    await expect(checkpointStore.get("meegle", "project/story")).resolves.toEqual(expect.objectContaining({
      watermarkUpdatedAt: "2026-08-26T00:00:00.000Z",
      watermarkTiebreaker: "story:1",
      version: 0,
    }));
    await expect(db.selectFrom("platform_sync_runs").select("status").executeTakeFirst())
      .resolves.toEqual({ status: "failed" });

    await db.destroy();
    await pool.end();
  });

  it("skips a second run while the same scope is leased", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const checkpointStore = new PostgresPlatformSyncCheckpointStore(db);
    const coordinator = new PlatformSyncCoordinator({
      checkpointStore,
      runStore: new PostgresPlatformSyncRunStore(db),
      leaseStore: new PostgresPlatformSyncLeaseStore(db),
    });
    await checkpointStore.createIfMissing({
      platform: "lark",
      scopeKey: "base/table",
      watermarkUpdatedAt: "2026-08-26T00:00:00.000Z",
      watermarkTiebreaker: "rec-1",
    });
    let enterFirst!: () => void;
    const entered = new Promise<void>((resolve) => { enterFirst = resolve; });
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = coordinator.runIncremental({
      platform: "lark",
      scopeKey: "base/table",
      trigger: "scheduled",
      execute: async () => {
        enterFirst();
        await gate;
        return syncResult();
      },
    });
    await entered;

    await expect(coordinator.runExclusive({
      platform: "lark",
      scopeKey: "base/table",
      mode: "full",
      cleanAfterSync: true,
      trigger: "manual",
      execute: async () => syncResult(),
    })).rejects.toMatchObject({ code: "SYNC_ALREADY_RUNNING" });
    releaseFirst();
    await first;
    await expect(db.selectFrom("platform_sync_runs").select("status").orderBy("started_at").execute())
      .resolves.toEqual(expect.arrayContaining([{ status: "succeeded" }, { status: "skipped" }]));

    await db.destroy();
    await pool.end();
  });

  it("fails closed when a safe checkpoint is absent", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const coordinator = new PlatformSyncCoordinator({
      checkpointStore: new PostgresPlatformSyncCheckpointStore(db),
      runStore: new PostgresPlatformSyncRunStore(db),
      leaseStore: new PostgresPlatformSyncLeaseStore(db),
    });
    const execute = vi.fn();

    await expect(coordinator.runIncremental({
      platform: "meegle",
      scopeKey: "project/story",
      trigger: "scheduled",
      execute,
    })).rejects.toEqual(expect.objectContaining<Partial<PlatformSyncCoordinatorError>>({
      code: "SYNC_CHECKPOINT_REQUIRED",
    }));
    expect(execute).not.toHaveBeenCalled();
    await expect(db.selectFrom("platform_sync_runs").select(["status", "error_code"]).executeTakeFirst())
      .resolves.toEqual({ status: "failed", error_code: "SYNC_CHECKPOINT_REQUIRED" });

    await db.destroy();
    await pool.end();
  });
});

function syncResult() {
  return {
    listed: 1,
    skippedInactive: 0,
    synced: 1,
    cleaned: 1,
    watermarkUpdatedAt: "2026-08-26T00:01:00.000Z",
    watermarkTiebreaker: "next",
  };
}
