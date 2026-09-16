import { PostgresLarkTicketThreadSyncStore } from "./lark-ticket-thread-sync-store.js";
import { createTestPostgresDatabase } from "./test-db.js";

describe("PostgresLarkTicketThreadSyncStore", () => {
  it("rebuilds v2 cache on read without writing source or cache, then persists v3 on sync", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresLarkTicketThreadSyncStore(db);
    const input = {
      baseId: "base", tableId: "table", recordId: "record", threadId: "thread", messageLink: "https://example.com",
      messages: [{ messageId: "m1", senderId: "private", senderType: "user", messageType: "post", content: JSON.stringify({ content: [[{ tag: "text", text: "Hello" }, { tag: "img" }]] }) }],
      historyComplete: true, checkedAt: "2026-09-14T00:00:00Z",
    };
    await store.saveSuccessfulSync(input);
    const old = JSON.stringify({ schemaVersion: 1, redactionVersion: "v2", snapshotVersion: 1, messages: [{ text: "old JSON" }] });
    await db.updateTable("lark_ticket_thread_syncs").set({ prepared_messages_json: old }).execute();
    const before = await db.selectFrom("lark_ticket_thread_syncs").selectAll().executeTakeFirstOrThrow();
    const snapshot = await store.get(input);
    expect(snapshot).toMatchObject({ snapshotVersion: 1, preparedMessages: [{ messageId: "m1", senderLabel: "用户 1", text: "Hello[图片]", hasArtifact: true }] });
    expect(await db.selectFrom("lark_ticket_thread_syncs").selectAll().executeTakeFirstOrThrow()).toEqual(before);
    await store.saveSuccessfulSync(input);
    const after = await db.selectFrom("lark_ticket_thread_syncs").selectAll().executeTakeFirstOrThrow();
    expect(after.messages_json).toBe(before.messages_json);
    expect(after.snapshot_version).toBe(1);
    expect(JSON.parse(after.prepared_messages_json!)).toMatchObject({ redactionVersion: "v3", snapshotVersion: 1 });
    await db.destroy();
    await pool.end();
  });
  it("stores one versioned JSON document and increments the version only when message content changes", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresLarkTicketThreadSyncStore(db);
    const input = {
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      messageLink: "https://applink.larksuite.com/client/thread/open?threadid=thread_1",
      threadId: "thread_1",
      messages: [{
        messageId: "om_1",
        messageType: "text",
        senderType: "user",
        content: "Contact jane@example.com about order ABCD-1234",
        createdAt: "2026-08-26T10:00:00.000Z",
      }],
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
    expect(first.preparedMessages).toEqual([expect.objectContaining({
      messageId: "om_1",
      senderRole: "user",
      text: "Contact [EMAIL] about [REFERENCE]",
    })]);
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
    expect(changed.preparedMessages).toHaveLength(2);

    const persisted = await db.selectFrom("lark_ticket_thread_syncs")
      .select(["messages_json", "prepared_messages_json"])
      .where("record_id", "=", "rec_1")
      .executeTakeFirstOrThrow();
    expect(persisted.messages_json).toContain("jane@example.com");
    expect(persisted.prepared_messages_json).not.toContain("jane@example.com");
    expect(JSON.parse(persisted.prepared_messages_json || "{}")).toMatchObject({
      schemaVersion: 1,
      redactionVersion: "v3",
      snapshotVersion: 2,
    });

    await db.destroy();
    await pool.end();
  });
});
