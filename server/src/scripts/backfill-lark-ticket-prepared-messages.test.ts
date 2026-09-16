import { createTestPostgresDatabase } from "../adapters/postgres/test-db.js";
import { serializePreparedMessages } from "../adapters/postgres/lark-ticket-thread-sync-store.js";
import {
  applyPreparedMessageBackfill,
  findPreparedMessageBackfillCandidates,
  parseArgs,
} from "./backfill-lark-ticket-prepared-messages.js";

describe("backfill Lark ticket prepared messages", () => {
  it("reports failed writes and continues the batch without logging raw errors", async () => {
    const query = {
      set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockRejectedValueOnce(new Error("private database details"))
        .mockResolvedValueOnce({ numUpdatedRows: 1n }),
    };
    const db = { updateTable: vi.fn().mockReturnValue(query) };
    const candidate = { baseId: "base", tableId: "table", recordId: "bad", snapshotVersion: 1, preparedMessagesJson: "{}" };
    await expect(applyPreparedMessageBackfill(db as never, [candidate, { ...candidate, recordId: "ok" }], 1))
      .resolves.toEqual({ updated: 1, stale: 0, failedRecordIds: ["bad"], staleRecordIds: [] });
  });
  it("rejects malformed raw records and selects v2 rich text for one-time rebuilding", () => {
    const base = { base_id: "base", table_id: "table", snapshot_version: 1, prepared_messages_json: JSON.stringify({ schemaVersion: 1, redactionVersion: "v2", snapshotVersion: 1, messages: [] }) };
    const raw = JSON.stringify({ schemaVersion: 1, messages: [{ messageId: "m1", messageType: "text", content: JSON.stringify({ text: "hello" }) }] });
    const selection = findPreparedMessageBackfillCandidates([
      { ...base, record_id: "ok", messages_json: raw },
      { ...base, record_id: "bad", messages_json: JSON.stringify({ schemaVersion: 1, messages: [{}] }) },
      { ...base, record_id: "bad-type", messages_json: JSON.stringify({ schemaVersion: 1, messages: [{ messageId: "m1", content: {} }] }) },
    ]);
    expect(selection.invalidRecordIds).toEqual(["bad", "bad-type"]);
    expect(selection.candidates).toHaveLength(1);
    const prepared = selection.candidates[0].preparedMessagesJson;
    expect(JSON.parse(prepared).messages[0].text).toBe("hello");
    expect(findPreparedMessageBackfillCandidates([{ ...base, record_id: "ok", messages_json: raw, prepared_messages_json: prepared }])).toMatchObject({ candidates: [], alreadyCurrent: 1 });
  });
  it("requires a local table scope and keeps apply independent from Lark credentials", () => {
    expect(parseArgs(["--base-id", "base", "--table-id", "table"])).toEqual({
      apply: false,
      baseId: "base",
      tableId: "table",
      concurrency: 3,
      limit: undefined,
    });
    expect(parseArgs(["--", "--base-id", "base", "--table-id", "table", "--apply", "--limit", "140", "--concurrency", "3"]))
      .toMatchObject({ apply: true, limit: 140, concurrency: 3 });
    expect(() => parseArgs(["--base-id", "base"])).toThrow("--base-id and --table-id");
    expect(() => parseArgs(["--base-id", "base", "--table-id", "table", "--concurrency", "6"])).toThrow("--concurrency");
    expect(() => parseArgs(["--base-id", "base", "--table-id", "table", "--master-user-id", "unused"])).toThrow("Unknown argument");
  });

  it("selects missing or stale prepared documents without reprocessing current rows", () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      messages: [{ messageId: "om_1", messageType: "text", senderType: "user", content: "Contact user@example.com" }],
    });
    const selection = findPreparedMessageBackfillCandidates([
      {
        base_id: "base", table_id: "table", record_id: "missing", messages_json: raw,
        prepared_messages_json: null, snapshot_version: 2,
      },
      {
        base_id: "base", table_id: "table", record_id: "current", messages_json: raw,
        prepared_messages_json: serializePreparedMessages([], 2), snapshot_version: 2,
      },
      {
        base_id: "base", table_id: "table", record_id: "stale", messages_json: raw,
        prepared_messages_json: serializePreparedMessages([], 1), snapshot_version: 2,
      },
      {
        base_id: "base", table_id: "table", record_id: "invalid", messages_json: "not-json",
        prepared_messages_json: null, snapshot_version: 1,
      },
    ]);

    expect(selection).toMatchObject({ alreadyCurrent: 1, invalidMessagesJson: 1 });
    expect(selection.candidates.map((candidate) => candidate.recordId)).toEqual(["missing", "stale"]);
    expect(selection.candidates[0].preparedMessagesJson).not.toContain("user@example.com");
    expect(selection.candidates[0].preparedMessagesJson).toContain("[EMAIL]");
  });

  it("writes only when the local snapshot version still matches", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const now = "2026-09-01T10:00:00.000Z";
    await db.insertInto("lark_ticket_thread_syncs").values({
      base_id: "base",
      table_id: "table",
      record_id: "rec_1",
      message_link: "https://example/thread",
      thread_id: "thread_1",
      messages_json: JSON.stringify({ schemaVersion: 1, messages: [] }),
      prepared_messages_json: null,
      snapshot_version: 2,
      history_complete: true,
      watermark_created_at: null,
      watermark_message_id: null,
      last_checked_at: now,
      last_successful_sync_at: now,
      last_full_reconciled_at: now,
      dirty: false,
      frozen_at: null,
      frozen_status: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    }).execute();
    const candidate = {
      baseId: "base",
      tableId: "table",
      recordId: "rec_1",
      snapshotVersion: 2,
      preparedMessagesJson: serializePreparedMessages([], 2),
    };

    await expect(applyPreparedMessageBackfill(db, [candidate], 1)).resolves.toEqual({ updated: 1, stale: 0, failedRecordIds: [], staleRecordIds: [] });
    await expect(applyPreparedMessageBackfill(db, [{ ...candidate, snapshotVersion: 1 }], 1)).resolves.toEqual({ updated: 0, stale: 1, failedRecordIds: [], staleRecordIds: ["rec_1"] });
    await expect(db.selectFrom("lark_ticket_thread_syncs").select("prepared_messages_json")
      .where("record_id", "=", "rec_1").executeTakeFirst()).resolves.toMatchObject({
      prepared_messages_json: candidate.preparedMessagesJson,
    });

    await db.destroy();
    await pool.end();
  });
});
