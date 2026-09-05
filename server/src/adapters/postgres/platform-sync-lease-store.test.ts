import { PostgresPlatformSyncLeaseStore } from "./platform-sync-lease-store.js";
import { createTestPostgresDatabase } from "./test-db.js";

describe("PostgresPlatformSyncLeaseStore", () => {
  it("serializes one scope and fences an expired owner", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncLeaseStore(db);
    const first = await store.acquire({
      platform: "github",
      scopeKey: "acme/app",
      runId: "run-1",
      leaseDurationMs: 60_000,
    }, "2026-08-26T00:00:00.000Z");

    expect(first).toBeDefined();
    await expect(store.acquire({
      platform: "github",
      scopeKey: "acme/app",
      runId: "run-2",
      leaseDurationMs: 60_000,
    }, "2026-08-26T00:00:30.000Z")).resolves.toBeUndefined();
    await expect(store.heartbeat(first!, 60_000, "2026-08-26T00:00:30.000Z")).resolves.toBe(true);

    const replacement = await store.acquire({
      platform: "github",
      scopeKey: "acme/app",
      runId: "run-3",
      leaseDurationMs: 60_000,
    }, "2026-08-26T00:01:31.000Z");
    expect(replacement).toEqual(expect.objectContaining({ runId: "run-3" }));
    await expect(store.isOwner(first!, "2026-08-26T00:01:31.000Z")).resolves.toBe(false);
    await expect(store.release(first!)).resolves.toBe(false);
    await expect(store.isOwner(replacement!, "2026-08-26T00:01:31.000Z")).resolves.toBe(true);
    await expect(store.release(replacement!)).resolves.toBe(true);

    await db.destroy();
    await pool.end();
  });
});
