import {
  findFinishedTicketThreadBackfillCandidates,
  mapWithConcurrency,
  parseArgs,
} from "./backfill-finished-lark-ticket-threads.js";

describe("backfill finished Lark ticket threads", () => {
  it("requires an explicitly scoped dry run and explicit credentials for apply", () => {
    expect(parseArgs(["--base-id", "base", "--table-id", "table"])).toEqual({
      apply: false,
      baseId: "base",
      tableId: "table",
      masterUserId: undefined,
      larkBaseUrl: undefined,
      concurrency: 3,
      limit: undefined,
    });
    expect(parseArgs([
      "--base-id", "base", "--table-id", "table", "--apply",
      "--master-user-id", "master", "--lark-base-url", "https://example.larksuite.com", "--concurrency", "2",
    ])).toMatchObject({ apply: true, concurrency: 2, masterUserId: "master" });
    expect(() => parseArgs(["--base-id", "base"])).toThrow("--base-id and --table-id");
    expect(() => parseArgs(["--base-id", "base", "--table-id", "table", "--apply"])).toThrow("--apply requires");
    expect(() => parseArgs(["--base-id", "base", "--table-id", "table", "--concurrency", "6"])).toThrow("--concurrency");
    expect(() => parseArgs(["--base-id", "base", "--table-id", "table", "--limit", "0"])).toThrow("--limit");
  });

  it("accepts a positive candidate limit", () => {
    expect(parseArgs(["--base-id", "base", "--table-id", "table", "--limit", "10"])).toMatchObject({
      apply: false,
      limit: 10,
    });
  });

  it("selects only unfinished snapshots for Finish tickets", () => {
    const result = findFinishedTicketThreadBackfillCandidates([
      {
        base_id: "base", table_id: "table", record_id: "rec-sync", ticket_status: "Finish",
        lark_message_link: "https://example.larksuite.com/client/thread/open?threadid=thread-sync",
        snapshot_thread_id: null, history_complete: null, messages_json: null,
      },
      {
        base_id: "base", table_id: "table", record_id: "rec-complete", ticket_status: "finish",
        lark_message_link: "https://example.larksuite.com/client/thread/open?threadid=thread-complete",
        snapshot_thread_id: "thread-complete", history_complete: true,
        messages_json: JSON.stringify({ messages: [{ messageId: "root-complete" }, { messageId: "reply-complete", rootId: "root-complete" }] }),
      },
      {
        base_id: "base", table_id: "table", record_id: "rec-link-changed", ticket_status: "finish",
        lark_message_link: "https://example.larksuite.com/client/thread/open?threadid=thread-new",
        snapshot_thread_id: "thread-old", history_complete: true, messages_json: null,
      },
      {
        base_id: "base", table_id: "table", record_id: "rec-no-link", ticket_status: "finish",
        lark_message_link: null, snapshot_thread_id: null, history_complete: null, messages_json: null,
      },
      {
        base_id: "base", table_id: "table", record_id: "rec-active", ticket_status: "In Progress",
        lark_message_link: "https://example.larksuite.com/client/thread/open?threadid=thread-active",
        snapshot_thread_id: null, history_complete: null, messages_json: null,
      },
    ]);
    expect(result).toEqual({
      candidates: [
        { baseId: "base", tableId: "table", recordId: "rec-sync" },
        { baseId: "base", tableId: "table", recordId: "rec-link-changed" },
      ],
      alreadyComplete: 1,
      missingThreadLink: 1,
      ignoredNonFinished: 1,
    });
  });

  it("retries an old complete snapshot that contains replies but no root message", () => {
    const result = findFinishedTicketThreadBackfillCandidates([{
      base_id: "base", table_id: "table", record_id: "rec-missing-root", ticket_status: "Finish",
      lark_message_link: "https://example.larksuite.com/client/thread/open?threadid=thread-1",
      snapshot_thread_id: "thread-1", history_complete: true,
      messages_json: JSON.stringify({ messages: [{ messageId: "reply-1", rootId: "root-1" }] }),
    }]);
    expect(result.candidates).toEqual([{ baseId: "base", tableId: "table", recordId: "rec-missing-root" }]);
  });

  it("accepts pnpm's leading argument separator", () => {
    expect(parseArgs(["--", "--base-id", "base", "--table-id", "table", "--limit", "10"])).toMatchObject({
      baseId: "base",
      tableId: "table",
      limit: 10,
    });
  });

  it("keeps every result while bounding concurrent operations", async () => {
    let active = 0;
    let maxActive = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    expect(result).toEqual([2, 4, 6, 8]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
