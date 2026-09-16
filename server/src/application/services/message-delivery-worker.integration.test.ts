import { MessageDeliveryWorker } from "./message-delivery-worker.js";
import { PostgresMessageOutboxStore } from "../../adapters/postgres/message-outbox-store.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import { LarkImNotificationError } from "../../adapters/lark/im-notification-client.js";

function worker(store: PostgresMessageOutboxStore, sendMessageToChat = vi.fn().mockResolvedValue({ messageId: "sent-id" })) {
  return { service: new MessageDeliveryWorker({ store, sender: { sendMessageToChat }, maxAttempts: 3, batchSize: 10, retryDelayMs: 60_000, claimDurationMs: 30_000 }), sendMessageToChat };
}

it("sends unrelated business messages using only their stored envelopes and deduplicates enqueue", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresMessageOutboxStore(db);
    await store.enqueue({ idempotencyKey: "build:1", chatId: "build-chat", text: "Build failure" });
    await store.enqueue({ idempotencyKey: "ticket:2", chatId: "ticket-chat", text: "Ticket reminder" });
    await store.enqueue({ idempotencyKey: "build:1", chatId: "wrong", text: "duplicate" });
    const { service, sendMessageToChat } = worker(store);
    await service.runCycle();
    await service.runCycle();
    expect(sendMessageToChat.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
      { idempotencyKey: "build:1", chatId: "build-chat", text: "Build failure" },
      { idempotencyKey: "ticket:2", chatId: "ticket-chat", text: "Ticket reminder" },
    ]));
    expect(sendMessageToChat).toHaveBeenCalledTimes(2);
    const rows = await db.selectFrom("message_outbox").selectAll().execute();
    expect(rows.every((row) => row.status === "sent" && row.message_id === "sent-id")).toBe(true);
  } finally { await db.destroy(); await pool.end(); }
});

it.each([
  ["retryable", 0, "pending_send"], ["retryable", 2, "failed"],
  ["permanent", 0, "failed"], ["uncertain", 0, "outcome_unknown"],
] as const)("handles %s send failure with %i previous attempts as %s", async (kind, attempts, status) => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresMessageOutboxStore(db);
    await store.enqueue({ idempotencyKey: "test", chatId: "chat", text: "message" }, { attempts });
    const send = vi.fn().mockRejectedValue(new LarkImNotificationError(kind, "SEND_ERROR", "failure"));
    const { service } = worker(store, send);
    await service.runCycle();
    const row = await db.selectFrom("message_outbox").selectAll().executeTakeFirstOrThrow();
    expect(row).toMatchObject({ status, error_code: "SEND_ERROR", attempts: attempts + 1 });
    if (status === "pending_send") expect(Date.parse(row.next_attempt_at!)).toBeGreaterThan(Date.now());
    await service.runCycle();
    expect(send).toHaveBeenCalledTimes(1);
    if (status === "pending_send") {
      await db.updateTable("message_outbox").set({ next_attempt_at: null }).execute();
      send.mockResolvedValueOnce({ messageId: "retry-success" });
      await service.runCycle();
      expect((await db.selectFrom("message_outbox").selectAll().executeTakeFirstOrThrow()).status).toBe("sent");
    }
  } finally { await db.destroy(); await pool.end(); }
});

it("does not resend after delivery succeeds but acknowledgement persistence fails", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresMessageOutboxStore(db);
    await store.enqueue({ idempotencyKey: "ack", chatId: "chat", text: "message" });
    const complete = vi.spyOn(store, "complete").mockRejectedValueOnce(new Error("DB unavailable"));
    const { service, sendMessageToChat } = worker(store);
    await service.runCycle();
    expect(complete).toHaveBeenLastCalledWith(expect.anything(), { status: "outcome_unknown", messageId: "sent-id", errorCode: "MESSAGE_ACK_FAILED" });
    await service.runCycle();
    expect(sendMessageToChat).toHaveBeenCalledTimes(1);
  } finally { await db.destroy(); await pool.end(); }
});

it("claims once, rejects stale claim updates, and never resends expired claims", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const store = new PostgresMessageOutboxStore(db);
    await store.enqueue({ idempotencyKey: "claim", chatId: "chat", text: "message" });
    const [id] = await store.listDue(3, 10, new Date().toISOString());
    const now = "2026-01-01T00:00:00.000Z";
    const first = await store.claim(id, 3, 1, now);
    expect(first).toBeDefined();
    expect(await store.claim(id, 3, 1, now)).toBeUndefined();
    await store.complete({ ...first!, claim_token: "wrong" }, { status: "sent" });
    expect((await db.selectFrom("message_outbox").selectAll().executeTakeFirstOrThrow()).status).toBe("sending");
    const { service, sendMessageToChat } = worker(store);
    await service.runCycle();
    expect(sendMessageToChat).not.toHaveBeenCalled();
    expect((await db.selectFrom("message_outbox").selectAll().executeTakeFirstOrThrow()).status).toBe("outcome_unknown");
  } finally { await db.destroy(); await pool.end(); }
});

it("keeps an in-flight delivery alive until shutdown completes and prevents overlapping cycles", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  let release!: (value: { messageId: string }) => void;
  try {
    const store = new PostgresMessageOutboxStore(db);
    await store.enqueue({ idempotencyKey: "stop", chatId: "chat", text: "message" });
    const send = vi.fn(() => new Promise<{ messageId: string }>((resolve) => { release = resolve; }));
    const service = new MessageDeliveryWorker({ store, sender: { sendMessageToChat: send }, maxAttempts: 3, batchSize: 10, retryDelayMs: 1, claimDurationMs: 30000 });
    const cycle = service.runCycle();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(service.runCycle()).toBe(cycle);
    let stopped = false;
    const stopping = service.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release({ messageId: "done" });
    await stopping;
    expect(stopped).toBe(true);
    await service.runCycle();
    expect(send).toHaveBeenCalledTimes(1);
  } finally { release?.({ messageId: "done" }); await db.destroy(); await pool.end(); }
});


it("isolates polling failures and sends on the next independent delivery tick", async () => {
  vi.useFakeTimers();
  const store = {
    recoverExpired: vi.fn().mockRejectedValueOnce(new Error("DB unavailable")).mockResolvedValue(undefined),
    listDue: vi.fn().mockResolvedValue([]), claim: vi.fn(), complete: vi.fn(),
  };
  const service = new MessageDeliveryWorker({ store, sender: { sendMessageToChat: vi.fn() }, maxAttempts: 3, batchSize: 10, retryDelayMs: 1000, claimDurationMs: 30000 });
  try {
    service.start(1000);
    service.start(1000);
    await service.runCycle();
    expect(store.listDue).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.listDue).toHaveBeenCalledTimes(1);
    await service.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.listDue).toHaveBeenCalledTimes(1);
  } finally { await service.stop(); vi.useRealTimers(); }
});
