import { OdooShBuildSyncService } from "./odoo-sh-build-sync.service.js";
import { PostgresOdooShBuildStore } from "../../adapters/postgres/odoo-sh-build-store.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import { odooDevopsBuildsSnapshotSchema, type OdooDevopsBuildsSnapshot } from "../../modules/odoo-devops-branches/odoo-devops-branches.dto.js";

function build(id: number, result = "failed") {
  return { id, result, status: "done", stage: "dev", odoo_branch: "17.0", url: "https://example.com/build", head_commit_author: "Jack", head_commit_url: "https://github.com/org/repo/commit/" + "a".repeat(40) };
}
function snapshot(builds = [build(101)]): OdooDevopsBuildsSnapshot {
  return { environment: "eu", project_id: 42, project_name: "tenways", cached: false, items: [{ branch_info: { name: "dev_main", stage: "dev" }, builds }] };
}

describe("OdooShBuildSyncService /builds", () => {
  it("baselines history, persists commit fields, and queues every new failed build once", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    try {
      const store = new PostgresOdooShBuildStore(db);
      const sync = new OdooShBuildSyncService({ store });
      expect(await sync.syncFromSnapshot(snapshot())).toMatchObject({ baseline: true, notificationsQueued: 0 });
      expect((await store.listBuildsByProject("eu", 42))[0]).toMatchObject({ headCommitAuthor: "Jack", commitSha: "a".repeat(40), pusherGithubId: null });
      const next = snapshot([build(104, "success"), build(103), build(102), build(101)]);
      expect(await sync.syncFromSnapshot(next)).toMatchObject({ inserted: 3, notificationsQueued: 2 });
      expect(await sync.syncFromSnapshot(next)).toMatchObject({ inserted: 0, updated: 0, touched: 4, notificationsQueued: 0 });
      const rows = await db.selectFrom("odoo_sh_build_notifications").selectAll().execute();
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.build_id).sort()).toEqual([102, 103]);
      expect(rows.every((row) => row.status === "pending_send")).toBe(true);
    } finally { await db.destroy(); await pool.end(); }
  });

  it("queues running-to-failed without requiring an author and ignores warning", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    try {
      const store = new PostgresOdooShBuildStore(db);
      const sync = new OdooShBuildSyncService({ store });
      await sync.syncFromSnapshot(snapshot([build(101, "")]));
      const failed = snapshot();
      failed.items[0].builds[0].head_commit_author = null;
      failed.items[0].builds[0].head_commit_url = null;
      expect(await sync.syncFromSnapshot(failed)).toMatchObject({ notificationsQueued: 1 });
      expect(await sync.syncFromSnapshot(snapshot([build(102, "warning"), build(101)]))).toMatchObject({ notificationsQueued: 0 });
    } finally { await db.destroy(); await pool.end(); }
  });

  it("rejects invalid real build ids and preserves upstream order", () => {
    const input = snapshot([build(3), build(1), build(2)]);
    expect(odooDevopsBuildsSnapshotSchema.parse(input).items[0].builds.map((b) => b.id)).toEqual([3, 1, 2]);
    expect(odooDevopsBuildsSnapshotSchema.safeParse(snapshot([build(0)])).success).toBe(false);
  });

  it("rejects duplicate build ids before persistence", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    try {
      const store = new PostgresOdooShBuildStore(db);
      await expect(new OdooShBuildSyncService({ store }).syncFromSnapshot(snapshot([build(1), build(1)])))
        .rejects.toThrow("ODOO_SH_DUPLICATE_BUILD_ID");
      expect(await store.listBuildsByProject("eu", 42)).toEqual([]);
    } finally { await db.destroy(); await pool.end(); }
  });
});

it("does not revive historical notices merely because author metadata changes", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresOdooShBuildStore(db);
    const sync = new OdooShBuildSyncService({ store });
    await sync.syncFromSnapshot(snapshot([build(102), build(101)]));
    await db.updateTable("odoo_sh_builds").set({ head_commit_author: null, head_commit_url: null }).execute();
    await store.applySnapshotSync({ environment: "eu", projectId: 42, inserts: [], updates: [], touchBuildIds: [],
      observedAt: new Date().toISOString(),
      notifications: [101, 102].map((buildId) => ({ environment: "eu", projectId: 42, buildId, status: "pending_identity" })),
    });
    await sync.syncFromSnapshot(snapshot([build(102), build(101)]));
    const rows = await db.selectFrom("odoo_sh_build_notifications").select(["build_id", "status"]).orderBy("build_id").execute();
    expect(rows).toEqual([{ build_id: 101, status: "pending_identity" }, { build_id: 102, status: "pending_identity" }]);
  } finally { await db.destroy(); await pool.end(); }
});


it("persists initialization even with no builds and resumes after service restart", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresOdooShBuildStore(db);
    expect(await new OdooShBuildSyncService({ store }).syncFromSnapshot(snapshot([])))
      .toMatchObject({ baseline: true, inserted: 0, notificationsQueued: 0 });
    expect(await store.hasBuildBaseline("eu", 42)).toBe(true);
    expect(await new OdooShBuildSyncService({ store }).syncFromSnapshot(snapshot()))
      .toMatchObject({ baseline: false, notificationsQueued: 1 });
    expect(await new OdooShBuildSyncService({ store }).syncFromSnapshot({ ...snapshot(), environment: "uk" }))
      .toMatchObject({ baseline: true, notificationsQueued: 0 });
  } finally { await db.destroy(); await pool.end(); }
});

it("initializes legacy build data without alerting on new history or failure transitions during initialization", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresOdooShBuildStore(db);
    const sync = new OdooShBuildSyncService({ store });
    await sync.syncFromSnapshot(snapshot([build(101, "")]));
    await db.deleteFrom("odoo_sh_build_sync_state").execute();
    expect(await sync.syncFromSnapshot(snapshot([build(102), build(101)])))
      .toMatchObject({ baseline: true, notificationsQueued: 0 });
    expect(await db.selectFrom("odoo_sh_build_notifications").selectAll().execute()).toEqual([]);
  } finally { await db.destroy(); await pool.end(); }
});
