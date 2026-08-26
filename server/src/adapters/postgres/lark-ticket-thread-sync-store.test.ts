import { PostgresLarkTicketThreadSyncStore } from "./lark-ticket-thread-sync-store.js";
import { createTestPostgresDatabase } from "./test-db.js";

describe("PostgresLarkTicketThreadSyncStore", () => {
  it("stores one versioned JSON document and increments the version only when message content changes", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresLarkTicketThreadSyncStore(db);
    const input = {
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      messageLink: "https://applink.larksuite.com/client/thread/open?threadid=thread_1",
      threadId: "thread_1",
      messages: [{ messageId: "om_1", content: "hello", createdAt: "2026-08-26T10:00:00.000Z" }],
      historyComplete: true,
      watermarkCreatedAt: "2026-08-26T10:00:00.000Z",
      watermarkMessageId: "om_1",
      checkedAt: "2026-08-26T11:00:00.000Z",
      fullReconciledAt: "2026-08-26T11:00:00.000Z",
    };

    const first = await store.saveSuccessfulSync(input);
    const unchanged = await store.saveSuccessfulSync({
      ...input,
      checkedAt: "2026-08-26T11:10:00.000Z",
      fullReconciledAt: undefined,
    });
    const changed = await store.saveSuccessfulSync({
      ...input,
      messages: [...input.messages, { messageId: "om_2", content: "reply", createdAt: "2026-08-26T10:05:00.000Z" }],
      checkedAt: "2026-08-26T11:20:00.000Z",
      frozenStatus: "Finish",
    });

    expect(first.snapshotVersion).toBe(1);
    expect(unchanged).toMatchObject({
      snapshotVersion: 1,
      lastSuccessfulSyncAt: "2026-08-26T11:10:00.000Z",
    });
    expect(changed).toMatchObject({
      snapshotVersion: 2,
      frozenStatus: "Finish",
      frozenAt: "2026-08-26T11:20:00.000Z",
    });
    expect(changed.messages).toHaveLength(2);

    await db.destroy();
    await pool.end();
  });
});
