import { PostgresPlatformSyncScheduleStore } from "./platform-sync-schedule-store.js";
import { createTestPostgresDatabase } from "./test-db.js";

describe("PostgresPlatformSyncScheduleStore", () => {
  it("persists, claims, coalesces, retries, and disables config schedules", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncScheduleStore(db);
    const definition = {
      scheduleId: "github:acme/app",
      platform: "github" as const,
      scopeKey: "acme/app",
      intervalSeconds: 600,
      target: { platform: "github" as const, owner: "acme", repo: "app" },
    };
    await store.reconcileConfigSchedules([definition], "2026-08-26T00:00:00.000Z");

    await expect(store.claimDue(1, "2026-08-26T00:00:00.000Z")).resolves.toEqual([
      expect.objectContaining({
        scheduleId: definition.scheduleId,
        target: definition.target,
        nextRunAt: "2026-08-26T00:10:00.000Z",
      }),
    ]);
    await expect(store.claimDue(1, "2026-08-26T00:00:00.000Z")).resolves.toEqual([]);

    await expect(store.markTransientFailure(
      definition.scheduleId,
      "NETWORK_ERROR",
      "2026-08-26T00:00:30.000Z",
    )).resolves.toBe("retry_scheduled");
    await expect(store.claimDue(1, "2026-08-26T00:01:29.000Z")).resolves.toEqual([]);
    await expect(store.claimDue(1, "2026-08-26T00:01:30.000Z")).resolves.toHaveLength(1);

    await store.reconcileConfigSchedules([], "2026-08-26T00:02:00.000Z");
    await expect(db.selectFrom("platform_sync_schedules")
      .select(["enabled", "next_run_at"])
      .where("schedule_id", "=", definition.scheduleId)
      .executeTakeFirst()).resolves.toEqual(expect.objectContaining({ enabled: false }));

    await db.destroy();
    await pool.end();
  });

  it("blocks a schedule after its third transient retry fails", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncScheduleStore(db);
    await store.reconcileConfigSchedules([{
      scheduleId: "github:acme/app",
      platform: "github",
      scopeKey: "acme/app",
      intervalSeconds: 600,
      target: { platform: "github", owner: "acme", repo: "app" },
    }], "2026-08-26T00:00:00.000Z");

    await store.markTransientFailure("github:acme/app", "NETWORK_ERROR", "2026-08-26T00:00:00.000Z");
    await store.markTransientFailure("github:acme/app", "NETWORK_ERROR", "2026-08-26T00:01:00.000Z");
    await store.markTransientFailure("github:acme/app", "NETWORK_ERROR", "2026-08-26T00:06:00.000Z");
    await expect(store.markTransientFailure(
      "github:acme/app",
      "NETWORK_ERROR",
      "2026-08-26T00:21:00.000Z",
    )).resolves.toBe("blocked");

    await expect(db.selectFrom("platform_sync_schedules")
      .select(["enabled", "blocked_reason"])
      .where("schedule_id", "=", "github:acme/app")
      .executeTakeFirst()).resolves.toEqual({
        enabled: false,
        blocked_reason: "NETWORK_ERROR:retry_exhausted",
      });

    await db.destroy();
    await pool.end();
  });
});
