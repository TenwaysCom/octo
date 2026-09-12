import { PostgresPlatformSyncRunStore } from "./platform-sync-run-store.js";
import { createTestPostgresDatabase } from "./test-db.js";

describe("PostgresPlatformSyncRunStore", () => {
  it("records completed and failed scope runs", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncRunStore(db);

    const complete = await store.start({ platform: "meegle", scopeKey: "project-a", mode: "full", cleanAfterSync: true });
    await store.completeSuccess(complete.runId, { listed: 3, skippedInactive: 1, synced: 2, cleaned: 2, stale: 1 });
    const failed = await store.start({ platform: "lark", scopeKey: "base/table", mode: "incremental", cleanAfterSync: true });
    await store.completeFailure(failed.runId, new Error("source unavailable"));

    await expect(db.selectFrom("platform_sync_runs").selectAll().orderBy("scope_key").execute()).resolves.toEqual([
      expect.objectContaining({
        run_id: failed.runId, platform: "lark", mode: "incremental", failed: true, error_message: "source unavailable",
      }),
      expect.objectContaining({
        run_id: complete.runId, platform: "meegle", mode: "full", listed: 3, cleaned: 2, stale: 1, failed: false,
      }),
    ]);

    await db.destroy();
    await pool.end();
  });
});
