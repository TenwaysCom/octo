import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import { PostgresOdooShBuildStore } from "../../adapters/postgres/odoo-sh-build-store.js";
import { OdooShBuildSyncService } from "./odoo-sh-build-sync.service.js";
import { OdooShMessageProducer } from "./odoo-sh-message-producer.js";
import type { OdooDevopsBuildsSnapshot } from "../../modules/odoo-devops-branches/odoo-devops-branches.dto.js";
import type { ResolvedUserRecord } from "../../adapters/postgres/resolved-user-store.js";

const snapshot = (result: string): OdooDevopsBuildsSnapshot => ({ environment: "eu", project_id: 42, project_name: "test", cached: false,
  items: [{ branch_info: { name: "main", stage: "dev" }, builds: [{ id: 101, result, status: "done", stage: "dev", odoo_branch: "17", url: null, head_commit_url: null, head_commit_author: "Author" }] }],
});

it("recovers message preparation after interruption, transfers once and cancels unsent messages on build recovery", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresOdooShBuildStore(db);
    const sync = new OdooShBuildSyncService({ store });
    const resolveCommitAuthor = vi.fn().mockRejectedValueOnce(new Error("identity DB unavailable")).mockResolvedValue(undefined);
    const producer = new OdooShMessageProducer({ store, resolveCommitAuthor, chatId: "dev-chat" });
    await sync.syncFromSnapshot(snapshot(""));
    await producer.prepare("eu", 42);
    expect(await db.selectFrom("message_outbox").selectAll().execute()).toEqual([]);
    await sync.syncFromSnapshot(snapshot("failed"));
    await producer.prepare("eu", 42);
    expect(await db.selectFrom("message_outbox").selectAll().execute()).toEqual([]);
    expect((await store.listNotificationsForPreparation("eu", 42))[0].status).toBe("pending_send");
    await producer.prepare("eu", 42);
    await producer.prepare("eu", 42);
    const rows = await db.selectFrom("message_outbox").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ chat_id: "dev-chat", status: "pending_send" });
    expect(rows[0].text).toContain("Odoo.sh build 失败");
    expect(rows[0].text).not.toContain("<at");
    expect((await store.listNotificationsForPreparation("eu", 42))[0].status).toBe("queued");
    await sync.syncFromSnapshot(snapshot("success"));
    await producer.prepare("eu", 42);
    expect((await db.selectFrom("message_outbox").selectAll().executeTakeFirstOrThrow()).status).toBe("cancelled");
  } finally { await db.destroy(); await pool.end(); }
});

it("prepares the author mention before delivery and skips a stale build observation", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresOdooShBuildStore(db);
    const sync = new OdooShBuildSyncService({ store });
    await sync.syncFromSnapshot(snapshot(""));
    await sync.syncFromSnapshot(snapshot("failed"));
    const build = (await store.listBuildsByProject("eu", 42))[0];
    const event = (await store.listNotificationsForPreparation("eu", 42))[0];
    expect(await store.prepareNotification(event.id, { ...build, updatedAt: "old" }, { idempotencyKey: "ignored", chatId: "chat", text: "stale" })).toBe(false);
    const producer = new OdooShMessageProducer({ store, chatId: "chat", resolveCommitAuthor: async () => ({ status: "active", larkId: "ou_author", larkName: "Author" } as ResolvedUserRecord) });
    await producer.prepare("eu", 42);
    const message = await db.selectFrom("message_outbox").selectAll().executeTakeFirstOrThrow();
    expect(message.text).toContain('<at user_id="ou_author">Author</at>');
    expect(message.idempotency_key).toBe(`odoo-sh-build-notify:${event.id}`);
  } finally { await db.destroy(); await pool.end(); }
});

it.each(["sent", "failed", "outcome_unknown", "sending", "pending_send", "pending_identity"])("preserves legacy %s history without unsafe replay", async (status) => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresOdooShBuildStore(db);
    const sync = new OdooShBuildSyncService({ store });
    await sync.syncFromSnapshot(snapshot(""));
    await sync.syncFromSnapshot(snapshot("failed"));
    await db.updateTable("odoo_sh_build_notifications").set({ status, attempts: 2, next_attempt_at: "2099-01-01T00:00:00.000Z", claim_expires_at: "2000-01-01T00:00:00.000Z" }).execute();
    await new OdooShMessageProducer({ store, chatId: "chat", resolveCommitAuthor: async () => undefined }).prepare("eu", 42);
    const outbox = await db.selectFrom("message_outbox").selectAll().execute();
    if (["pending_send", "pending_identity"].includes(status)) {
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({ attempts: 2, next_attempt_at: "2099-01-01T00:00:00.000Z" });
    } else {
      expect(outbox).toEqual([]);
      expect((await db.selectFrom("odoo_sh_build_notifications").selectAll().executeTakeFirstOrThrow()).status).toBe(status === "sending" ? "outcome_unknown" : status);
    }
  } finally { await db.destroy(); await pool.end(); }
});

it("keeps all environments synced but only queues EU and cancels existing UK/US pending messages", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresOdooShBuildStore(db);
    const sync = new OdooShBuildSyncService({ store });
    const resolveCommitAuthor = vi.fn().mockResolvedValue(undefined);
    const legacy = new OdooShMessageProducer({ store, chatId: "chat", resolveCommitAuthor, notificationEnvironments: ["eu", "uk", "us"] });
    for (const environment of ["eu", "uk", "us"] as const) {
      await sync.syncFromSnapshot({ ...snapshot(""), environment });
      await sync.syncFromSnapshot({ ...snapshot("failed"), environment });
      await legacy.prepare(environment, 42);
    }
    const producer = new OdooShMessageProducer({ store, chatId: "chat", resolveCommitAuthor });
    await producer.applyNotificationPolicy();
    for (const environment of ["eu", "uk", "us"] as const) {
      expect(await store.listBuildsByProject(environment, 42)).toHaveLength(1);
      await producer.prepare(environment, 42);
      const event = (await store.listNotificationsForPreparation(environment, 42))[0];
      const message = await db.selectFrom("message_outbox").selectAll()
        .where("idempotency_key", "=", `odoo-sh-build-notify:${event.id}`).executeTakeFirstOrThrow();
      expect(message.status).toBe(environment === "eu" ? "pending_send" : "cancelled");
    }
    // New failures in disabled environments remain audited but never become messages.
    await sync.syncFromSnapshot({ ...snapshot(""), environment: "uk", project_id: 43 });
    await sync.syncFromSnapshot({ ...snapshot("failed"), environment: "uk", project_id: 43 });
    resolveCommitAuthor.mockClear();
    await producer.prepare("uk", 43);
    expect(resolveCommitAuthor).not.toHaveBeenCalled();
    expect(await db.selectFrom("message_outbox").selectAll().execute()).toHaveLength(3);
    expect(await db.selectFrom("odoo_sh_build_notifications").select(["status", "error_code"])
      .where("project_id", "=", 43).executeTakeFirstOrThrow()).toEqual({ status: "failed", error_code: "ODOO_SH_NOTIFY_ENVIRONMENT_DISABLED" });
  } finally { await db.destroy(); await pool.end(); }
});

it.each(["sending", "sent", "failed", "outcome_unknown"])("environment policy preserves %s delivery history", async (status) => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresOdooShBuildStore(db);
    const sync = new OdooShBuildSyncService({ store });
    await sync.syncFromSnapshot({ ...snapshot(""), environment: "us" });
    await sync.syncFromSnapshot({ ...snapshot("failed"), environment: "us" });
    await new OdooShMessageProducer({ store, chatId: "chat", resolveCommitAuthor: async () => undefined, notificationEnvironments: ["us"] }).prepare("us", 42);
    await db.updateTable("message_outbox").set({ status }).execute();
    await new OdooShMessageProducer({ store, chatId: "chat", resolveCommitAuthor: async () => undefined }).applyNotificationPolicy();
    expect((await db.selectFrom("message_outbox").selectAll().executeTakeFirstOrThrow()).status).toBe(status);
  } finally { await db.destroy(); await pool.end(); }
});
