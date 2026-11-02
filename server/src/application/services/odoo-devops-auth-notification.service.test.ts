import { createHash } from "node:crypto";
import { OdooDevopsBranchesClientError } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";
import { PostgresMessageOutboxStore } from "../../adapters/postgres/message-outbox-store.js";
import type { ResolvedUserRecord } from "../../adapters/postgres/resolved-user-store.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import { MessageDeliveryWorker } from "./message-delivery-worker.js";
import { OdooDevopsAuthNotificationService } from "./odoo-devops-auth-notification.service.js";
import { OdooShBuildRefreshScheduler } from "./odoo-sh-build-refresh-scheduler.js";

function user(input: Partial<ResolvedUserRecord> = {}): ResolvedUserRecord {
  return {
    id: "ben", status: "active", larkId: "ou_ben", larkName: "Ben Lin",
    larkTenantKey: null, larkEmail: null, larkAvatarUrl: null, meegleBaseUrl: null,
    meegleUserKey: null, githubId: "uynil", role: null, createdAt: "", updatedAt: "",
    ...input,
  };
}

const event = { actionRunId: "auth-refresh", environments: ["eu", "uk", "us"] as ("eu" | "uk" | "us")[] };

it("delivers one configured alert across refreshes and restarts, and allows a new session to alert", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  const schedulers: OdooShBuildRefreshScheduler[] = [];
  try {
    const outbox = new PostgresMessageOutboxStore(db);
    const users = { getByGithubId: vi.fn().mockResolvedValue(user()) };
    const refresh = vi.fn().mockRejectedValue(new OdooDevopsBranchesClientError("ODOO_DEVOPS_AUTH_REQUIRED"));
    const create = (session: string) => {
      const notification = new OdooDevopsAuthNotificationService({
        outbox, users, chatId: "configured-auth-chat", recipientGithubLogins: ["uynil"],
        sessionFingerprint: createHash("sha256").update(session).digest("hex"),
      });
      const scheduler = new OdooShBuildRefreshScheduler({ refresh, notifyAuthFailure: (input) => notification.notify(input) });
      schedulers.push(scheduler);
      return scheduler;
    };
    const first = create("test-session-before");
    await first.runCycle();
    await first.runCycle();
    await create("test-session-before").runCycle();
    const rows = await db.selectFrom("message_outbox").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ chat_id: "configured-auth-chat", status: "pending_send" });
    expect(rows[0].text).toContain('<at user_id="ou_ben">Ben Lin</at>');
    expect(rows[0].text).toContain("环境：EU / UK / US");
    expect(JSON.stringify(rows)).not.toContain("test-session-before");

    const sendMessageToChat = vi.fn().mockResolvedValue({ messageId: "auth-message" });
    const delivery = new MessageDeliveryWorker({
      store: outbox, sender: { sendMessageToChat }, maxAttempts: 3, batchSize: 10,
      retryDelayMs: 60_000, claimDurationMs: 30_000,
    });
    await delivery.runCycle();
    await create("test-session-before").runCycle();
    await delivery.runCycle();
    expect(sendMessageToChat).toHaveBeenCalledExactlyOnceWith({
      chatId: "configured-auth-chat", text: rows[0].text, idempotencyKey: rows[0].idempotency_key,
    });
    expect((await db.selectFrom("message_outbox").selectAll().executeTakeFirstOrThrow()).status).toBe("sent");

    await create("test-session-after").runCycle();
    await delivery.runCycle();
    expect(sendMessageToChat).toHaveBeenCalledTimes(2);
    expect(await db.selectFrom("message_outbox").selectAll().execute()).toHaveLength(2);
    await delivery.stop();
  } finally {
    await Promise.all(schedulers.map((scheduler) => scheduler.stop()));
    await db.destroy(); await pool.end();
  }
});

it("resolves multiple configured recipients, deduplicates mentions and escapes display names", async () => {
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const getByGithubId = vi.fn(async (login: string) => login === "uynil" ? user() : user({ larkId: "ou_other", larkName: 'Other <at user_id="all">' }));
  const notification = new OdooDevopsAuthNotificationService({
    outbox: { enqueue }, users: { getByGithubId }, sessionFingerprint: "fingerprint",
    chatId: "other-chat", recipientGithubLogins: [" UYNIL ", "uynil", "other"],
  });
  await notification.notify(event);
  expect(getByGithubId.mock.calls).toEqual([["uynil"], ["other"]]);
  const message = enqueue.mock.calls[0][0];
  expect(message.chatId).toBe("other-chat");
  expect(message.text).toContain('<at user_id="ou_other">Other &lt;at user_id=&quot;all&quot;&gt;</at>');
  expect(message.text.match(/user_id="ou_ben"/g)).toHaveLength(1);
  expect(message.text).not.toContain('user_id="all"');
});

it("still alerts the group when configured recipients have no active Lark binding", async () => {
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const getByGithubId = vi.fn(async (login: string) => {
    if (login === "inactive") return user({ status: "conflict" });
    if (login === "unbound") return user({ larkId: null });
    return undefined;
  });
  const notification = new OdooDevopsAuthNotificationService({
    outbox: { enqueue }, users: { getByGithubId }, sessionFingerprint: "fingerprint",
    chatId: "auth-chat", recipientGithubLogins: ["missing", "inactive", "unbound"],
  });
  await notification.notify(event);
  expect(enqueue).toHaveBeenCalledTimes(1);
  expect(enqueue.mock.calls[0][0].text).toContain("登录态失效");
  expect(enqueue.mock.calls[0][0].text).not.toContain("<at");
});

it("retries identity lookup and enqueue failures and suppresses subsequent successful preparation", async () => {
  const getByGithubId = vi.fn().mockRejectedValueOnce(new Error("lookup failed")).mockResolvedValue(user());
  const enqueue = vi.fn().mockRejectedValueOnce(new Error("enqueue failed")).mockResolvedValue(undefined);
  const notification = new OdooDevopsAuthNotificationService({
    outbox: { enqueue }, users: { getByGithubId }, sessionFingerprint: "fingerprint",
    chatId: "auth-chat", recipientGithubLogins: ["uynil"],
  });
  await expect(notification.notify(event)).rejects.toThrow("lookup failed");
  expect(enqueue).not.toHaveBeenCalled();
  await expect(notification.notify(event)).rejects.toThrow("enqueue failed");
  await notification.notify(event);
  await notification.notify(event);
  expect(enqueue).toHaveBeenCalledTimes(2);
  expect(enqueue.mock.calls[0][0].idempotencyKey).toBe(enqueue.mock.calls[1][0].idempotencyKey);
});

it("does not prepare an alert without an authentication failure", async () => {
  const enqueue = vi.fn();
  const notification = new OdooDevopsAuthNotificationService({
    outbox: { enqueue }, users: { getByGithubId: vi.fn() }, sessionFingerprint: "fingerprint",
    chatId: "auth-chat", recipientGithubLogins: [],
  });
  await notification.notify({ actionRunId: "healthy", environments: [] });
  expect(enqueue).not.toHaveBeenCalled();
});
