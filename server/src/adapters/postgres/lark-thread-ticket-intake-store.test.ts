import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresLarkThreadTicketIntakeStore } from "./lark-thread-ticket-intake-store.js";

describe("PostgresLarkThreadTicketIntakeStore (pg-mem)", () => {
  it("persists a stable thread identity and rejects an outdated write transition", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    try {
      const store = new PostgresLarkThreadTicketIntakeStore(db);
      const first = await store.enqueue("source", "thread", "root");
      const duplicate = await store.enqueue("source", "thread", "another_root");
      expect(duplicate.action_run_id).toBe(first.action_run_id);
      expect(duplicate.root_message_id).toBe("root");
      const creating = await store.advance(first, "creating");
      await expect(store.advance(duplicate, "creating")).rejects.toThrow("STAGE_CONFLICT");
      await store.advance(creating, "outcome_unknown");
      expect(await store.listPending("source", 5)).toEqual([]);
    } finally { await db.destroy(); await pool.end(); }
  });

  it("retains the original scan boundary and stops automatic retries after five failures", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    try {
      const store = new PostgresLarkThreadTicketIntakeStore(db);
      await store.initializeScan("source", "2026-11-03T00:00:00.000Z");
      await store.advanceScan("source", "2026-11-03T00:05:00.000Z");
      await store.advanceScan("source", "2026-11-03T00:01:00.000Z");
      expect(await store.initializeScan("source", "2026-11-04T00:00:00.000Z")).toEqual({ startedAt: "2026-11-03T00:00:00.000Z", watermark: "2026-11-03T00:05:00.000Z" });
      let run = await store.enqueue("source", "thread", "root");
      for (let count = 0; count < 5; count++) {
        await store.recordFailure(run, "SHADOW_FAILED");
        run = (await store.get("source", "thread"))!;
      }
      expect(run.attempts).toBe(5);
      expect(await store.listPending("source", 5)).toEqual([]);
    } finally { await db.destroy(); await pool.end(); }
  });
});
