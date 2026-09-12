import { PostgresOdooShBuildStore } from "./odoo-sh-build-store.js";
import { createTestPostgresDatabase } from "./test-db.js";

const observedAt = "2026-09-10T08:00:00.000Z";

function buildInput(overrides: Partial<Parameters<PostgresOdooShBuildStore["applySnapshotSync"]>[0]["inserts"][number]> = {}) {
  return {
    buildId: 101,
    branch: "feature/example",
    stage: "staging",
    odooBranch: "17.0",
    lastBuildStatus: "running",
    lastBuildResult: "",
    buildUrl: null,
    commitSha: null,
    pusherGithubId: null,
    ...overrides,
  };
}

async function setup() {
  const { db, pool } = await createTestPostgresDatabase();
  const store = new PostgresOdooShBuildStore(db);
  return { db, pool, store };
}

describe("PostgresOdooShBuildStore", () => {
  it("applies one snapshot diff transactionally with inserts, updates, touches, and queued notifications", async () => {
    const { db, pool, store } = await setup();
    await store.applySnapshotSync({
      environment: "eu",
      projectId: 42,
      inserts: [buildInput({ buildId: 100, lastBuildStatus: "done", lastBuildResult: "success" })],
      updates: [],
      touchBuildIds: [],
      notifications: [],
      observedAt,
    });

    const result = await store.applySnapshotSync({
      environment: "eu",
      projectId: 42,
      inserts: [buildInput({ buildId: 101, lastBuildStatus: "done", lastBuildResult: "failed" })],
      updates: [{
        ...buildInput({ lastBuildStatus: "done", lastBuildResult: "failed", buildUrl: "https://eu.dev.odoo.com/web" }),
        previousPusherGithubId: null,
      }],
      touchBuildIds: [100],
      notifications: [{ environment: "eu", projectId: 42, buildId: 101, status: "pending_identity" }],
      observedAt,
    });

    expect(result).toEqual({ inserted: 1, updated: 1, touched: 1, notificationsQueued: 1 });
    const builds = await store.listBuildsByProject("eu", 42);
    expect(builds).toHaveLength(2);
    const failed = builds.find((build) => build.buildId === 101);
    expect(failed).toMatchObject({ lastBuildResult: "failed", buildUrl: "https://eu.dev.odoo.com/web" });
    await db.destroy();
    await pool.end();
  });

  it("does not queue a second notification for the same build", async () => {
    const { db, pool, store } = await setup();
    await store.applySnapshotSync({
      environment: "uk",
      projectId: 7,
      inserts: [buildInput({ buildId: 200, lastBuildStatus: "done", lastBuildResult: "failed" })],
      updates: [],
      touchBuildIds: [],
      notifications: [{ environment: "uk", projectId: 7, buildId: 200, status: "pending_identity" }],
      observedAt,
    });

    const repeat = await store.applySnapshotSync({
      environment: "uk",
      projectId: 7,
      inserts: [],
      updates: [{
        ...buildInput({ buildId: 200, lastBuildStatus: "done", lastBuildResult: "failed" }),
        previousPusherGithubId: null,
      }],
      touchBuildIds: [],
      notifications: [{ environment: "uk", projectId: 7, buildId: 200, status: "pending_identity" }],
      observedAt,
    });

    expect(repeat.notificationsQueued).toBe(0);
    await db.destroy();
    await pool.end();
  });

  it("claims a due notification once and lets the concurrent claim lose", async () => {
    const { db, pool, store } = await setup();
    await store.applySnapshotSync({
      environment: "us",
      projectId: 9,
      inserts: [buildInput({ buildId: 300 })],
      updates: [],
      touchBuildIds: [],
      notifications: [{ environment: "us", projectId: 9, buildId: 300, status: "pending_send" }],
      observedAt,
    });

    const [first, second] = await Promise.all([
      store.claimNotification((await store.listDueNotificationIds({ maxAttempts: 3, now: observedAt, limit: 5 }))[0], 60_000, observedAt),
      store.claimNotification((await store.listDueNotificationIds({ maxAttempts: 3, now: observedAt, limit: 5 }))[0], 60_000, observedAt),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    await db.destroy();
    await pool.end();
  });

  it.each([1, 3])("quarantines expired claims after a long outage regardless of attempts (%s)", async (attempts) => {
    const { db, pool, store } = await setup();
    try {
      await store.applySnapshotSync({
        environment: "eu", projectId: 42, inserts: [buildInput({ buildId: 400 })],
        updates: [], touchBuildIds: [],
        notifications: [{ environment: "eu", projectId: 42, buildId: 400, status: "pending_send" }], observedAt,
      });
      const [id] = await store.listDueNotificationIds({ maxAttempts: 3, now: observedAt, limit: 5 });
      await store.claimNotification(id, 60_000, observedAt);
      await db.updateTable("odoo_sh_build_notifications").set({ attempts }).where("id", "=", id).execute();
      expect(await store.reclaimExpiredClaims({ now: observedAt })).toBe(0);
      // Remote delivery might have succeeded just before the process died; the UUID window has elapsed.
      const recoveredAt = "2026-09-10T10:00:00.000Z";
      expect(await store.reclaimExpiredClaims({ now: recoveredAt })).toBe(1);
      expect(await store.listDueNotificationIds({ maxAttempts: 3, now: recoveredAt, limit: 5 })).toEqual([]);
      expect(await store.claimNotification(id, 60_000, recoveredAt)).toBeUndefined();
      expect(await db.selectFrom("odoo_sh_build_notifications").selectAll().where("id", "=", id).executeTakeFirst())
        .toMatchObject({ status: "outcome_unknown", error_code: "ODOO_SH_NOTIFY_CLAIM_EXPIRED", attempts });
      expect(await store.reclaimExpiredClaims({ now: recoveredAt })).toBe(0);
    } finally { await db.destroy(); await pool.end(); }
  });

  it("persists sent message ids and terminal failure reasons", async () => {
    const { db, pool, store } = await setup();
    await store.applySnapshotSync({
      environment: "uk",
      projectId: 7,
      inserts: [buildInput({ buildId: 500 })],
      updates: [],
      touchBuildIds: [],
      notifications: [{ environment: "uk", projectId: 7, buildId: 500, status: "pending_send" }],
      observedAt,
    });
    const id = (await store.listDueNotificationIds({ maxAttempts: 3, now: observedAt, limit: 5 }))[0];
    await store.claimNotification(id, 60_000, observedAt);
    await store.markNotificationSent(id, "om_123", "2026-09-10T08:00:10.000Z");

    const sentBuilds = await store.listBuildsByProject("uk", 7);
    expect(sentBuilds).toHaveLength(1);
    const rows = await db.selectFrom("odoo_sh_build_notifications").selectAll().execute();
    expect(rows).toMatchObject([{ status: "sent", message_id: "om_123", claim_token: null }]);
    await db.destroy();
    await pool.end();
  });

  it("keeps outcome_unknown rows out of the retry queue", async () => {
    const { db, pool, store } = await setup();
    await store.applySnapshotSync({
      environment: "us",
      projectId: 9,
      inserts: [buildInput({ buildId: 600 })],
      updates: [],
      touchBuildIds: [],
      notifications: [{ environment: "us", projectId: 9, buildId: 600, status: "pending_send" }],
      observedAt,
    });
    const id = (await store.listDueNotificationIds({ maxAttempts: 3, now: observedAt, limit: 5 }))[0];
    await store.claimNotification(id, 60_000, observedAt);
    await store.markNotificationOutcomeUnknown(id, {
      errorCode: "LARK_IM_SEND_UNCERTAIN",
      errorMessage: "timeout",
      now: "2026-09-10T08:00:10.000Z",
    });

    await expect(store.listDueNotificationIds({ maxAttempts: 3, now: "2026-09-10T09:00:00.000Z", limit: 5 }))
      .resolves.toEqual([]);
    await db.destroy();
    await pool.end();
  });
});


it("persists a confirmed remote message id when local acknowledgement needs reconciliation", async () => {
  const { db, pool, store } = await setup();
  try {
    await store.applySnapshotSync({ environment: "eu", projectId: 42, inserts: [buildInput()], updates: [], touchBuildIds: [],
      notifications: [{ environment: "eu", projectId: 42, buildId: 101, status: "pending_send" }], observedAt });
    const [id] = await store.listDueNotificationIds({ maxAttempts: 3, now: observedAt, limit: 5 });
    await store.claimNotification(id, 60_000, observedAt);
    await store.markNotificationOutcomeUnknown(id, { errorCode: "ODOO_SH_NOTIFY_ACK_FAILED", errorMessage: "ack failed", messageId: "om_delivered", now: observedAt });
    expect(await db.selectFrom("odoo_sh_build_notifications").selectAll().where("id", "=", id).executeTakeFirst())
      .toMatchObject({ status: "outcome_unknown", message_id: "om_delivered" });
    expect(await store.listDueNotificationIds({ maxAttempts: 3, now: observedAt, limit: 5 })).toEqual([]);
  } finally { await db.destroy(); await pool.end(); }
});
