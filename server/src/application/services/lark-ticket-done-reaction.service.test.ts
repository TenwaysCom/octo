import { LarkAPIError } from "../../adapters/lark/lark-client.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import { PostgresLarkTicketDoneStore } from "../../adapters/postgres/lark-ticket-done-store.js";
import { PostgresPlatformSyncCheckpointStore } from "../../adapters/postgres/platform-sync-checkpoint-store.js";
import { PostgresPlatformSyncRunStore } from "../../adapters/postgres/platform-sync-run-store.js";
import { PostgresPlatformSyncLeaseStore } from "../../adapters/postgres/platform-sync-lease-store.js";
import { PlatformSyncCoordinator } from "./platform-sync-coordinator.js";
import { createLarkTicketDoneReactionService, resolveDoneRoot } from "./lark-ticket-done-reaction.service.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { vi.useRealTimers(); for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function fixture(targetStatus = "Finish") {
  const { db, pool } = await createTestPostgresDatabase();
  cleanups.push(async () => { await db.destroy(); await pool.end(); });
  let time = new Date("2027-01-01T00:00:00.000Z");
  const source = { baseId: "base", tableId: "table", statusFieldName: "Status", sourceUpdatedAtFieldName: "最后更新时间" };
  const link = "https://applink.larksuite.com/client/thread/open?openthreadid=omt_thread&openchatid=oc_othergroup&messageid=om_root";
  const record = { record_id: "rec_1", updated_time: "2027-01-01T00:01:00.000Z", fields: { Status: targetStatus, "Lark Message Link": link } };
  const own = { reaction_id: "reaction_1", operator: { operator_id: "cli_app", operator_type: "app" as const }, reaction_type: { emoji_type: "DONE" } };
  let reactions: typeof own[] = [];
  const client = {
    getFields: vi.fn().mockResolvedValue([{ field_name: "Status" }, { field_name: "最后更新时间" }]),
    listRecords: vi.fn().mockImplementation(async () => ({ records: [record], hasMore: false })),
    batchGetRecords: vi.fn().mockImplementation(async () => ({ records: [record], forbidden_record_ids: [], absent_record_ids: [] })),
    getMessage: vi.fn().mockResolvedValue({ message_id: "om_root", thread_id: "omt_thread", chat_id: "oc_othergroup" }),
    getThreadMessages: vi.fn().mockResolvedValue({ items: [{ message_id: "om_reply", root_id: "om_root", thread_id: "omt_thread", chat_id: "oc_othergroup" }], hasMore: false }),
    listMessageReactions: vi.fn().mockImplementation(async () => ({ items: reactions, hasMore: false })),
    createMessageReaction: vi.fn().mockImplementation(async () => { reactions = [own]; return own; }),
  };
  const store = new PostgresLarkTicketDoneStore(db);
  const coordinator = new PlatformSyncCoordinator({
    checkpointStore: new PostgresPlatformSyncCheckpointStore(db), runStore: new PostgresPlatformSyncRunStore(db),
    leaseStore: new PostgresPlatformSyncLeaseStore(db), leaseDurationMs: 60_000,
  });
  const recreate = (overrides: { targetStatus?: string } = {}) => createLarkTicketDoneReactionService({
    store, coordinator, sources: [source], appId: "cli_app", createClient: async () => client,
    targetStatus, intervalMinutes: 10, overlapMinutes: 5, now: () => time, ...overrides,
  });
  const runtime = recreate();
  const enqueue = () => store.enqueue({ sourceKey: "base/table", appId: "cli_app", recordId: record.record_id,
    sourceUpdatedAt: record.updated_time, messageLink: link });
  return { db, store, client, runtime, recreate, record, link, own, enqueue,
    setTime: (value: string) => { time = new Date(value); },
    setReactions: (value: typeof own[]) => { reactions = value; } };
}

describe("Done reactions with persisted state and coordinated leases", () => {
  it("starts without backfill, then scans every incremental range with a five minute overlap", async () => {
    const f = await fixture();
    await f.runtime.runOnce();
    expect(f.client.listRecords).not.toHaveBeenCalled();
    f.setTime("2027-01-01T00:10:00.000Z");
    await f.runtime.runOnce();
    expect(f.client.listRecords.mock.calls[0]?.[2].filter).toContain('TODATE("2027-01-01T00:00:00.000Z")');
    expect(f.client.createMessageReaction).toHaveBeenCalledExactlyOnceWith("om_root", "DONE");
    f.setTime("2027-01-01T00:20:00.000Z");
    await f.runtime.runOnce();
    expect(f.client.listRecords.mock.calls[1]?.[2].filter).toContain('TODATE("2027-01-01T00:05:00.000Z")');
    expect(f.client.createMessageReaction).toHaveBeenCalledTimes(1);
    expect((await f.db.selectFrom("lark_ticket_done_scans").selectAll().executeTakeFirstOrThrow()).watermark).toBe("2027-01-01T00:20:00.000Z");
  });

  it("keeps the watermark and queue unchanged if later pagination fails", async () => {
    const f = await fixture();
    await f.runtime.runOnce();
    f.setTime("2027-01-01T00:10:00.000Z");
    f.client.listRecords.mockResolvedValueOnce({ records: [f.record], hasMore: true, nextPageToken: "next" })
      .mockRejectedValueOnce(new Error("sensitive upstream payload"));
    await f.runtime.runOnce();
    expect((await f.db.selectFrom("lark_ticket_done_scans").selectAll().executeTakeFirstOrThrow()).watermark).toBe("2027-01-01T00:00:00.000Z");
    expect(await f.db.selectFrom("lark_ticket_done_reactions").selectAll().execute()).toEqual([]);
    await f.runtime.runOnce();
    expect(f.client.createMessageReaction).toHaveBeenCalledTimes(1);
  });

  it("does not advance for missing source timestamps", async () => {
    const f = await fixture();
    await f.runtime.runOnce();
    f.setTime("2027-01-01T00:10:00.000Z");
    f.client.listRecords.mockResolvedValue({ records: [{ ...f.record, updated_time: undefined }], hasMore: false });
    await f.runtime.runOnce();
    expect((await f.db.selectFrom("lark_ticket_done_scans").selectAll().executeTakeFirstOrThrow()).watermark).toBe("2027-01-01T00:00:00.000Z");
    expect(f.client.createMessageReaction).not.toHaveBeenCalled();
  });

  it("paginates all records and avoids duplicate reactions across linked records", async () => {
    const f = await fixture();
    await f.runtime.runOnce();
    f.setTime("2027-01-01T00:10:00.000Z");
    f.client.listRecords.mockResolvedValueOnce({ records: [f.record], hasMore: true, nextPageToken: "next" })
      .mockResolvedValueOnce({ records: [{ ...f.record, record_id: "rec_2" }], hasMore: false });
    f.client.batchGetRecords.mockImplementation(async (_base, _table, ids) => ({ records: [{ ...f.record, record_id: ids[0] }], forbidden_record_ids: [], absent_record_ids: [] }));
    await f.runtime.runOnce();
    expect(f.client.listRecords.mock.calls[1]?.[2].pageToken).toBe("next");
    expect(f.client.createMessageReaction).toHaveBeenCalledTimes(1);
    expect(await f.db.selectFrom("lark_ticket_done_reactions").select("stage").execute()).toEqual([{ stage: "done" }, { stage: "done" }]);
  });

  it("only accepts the current application's DONE, including on later reaction pages", async () => {
    const f = await fixture();
    f.client.listMessageReactions.mockResolvedValueOnce({ items: [{ ...f.own, operator: { operator_type: "user", operator_id: "cli_app" } }], hasMore: true, pageToken: "next" })
      .mockResolvedValueOnce({ items: [f.own], hasMore: false });
    await expect(f.recreate().processRecord("base", "table", "rec_1")).resolves.toMatchObject({ status: "done" });
    expect(f.client.createMessageReaction).not.toHaveBeenCalled();
    expect(f.client.listMessageReactions.mock.calls[1]?.[1].pageToken).toBe("next");
  });

  it("reconciles a timed-out write after restart without sending it again", async () => {
    const f = await fixture();
    f.client.createMessageReaction.mockImplementationOnce(async () => { f.setReactions([f.own]); throw new Error("timeout private details"); });
    const first = await f.runtime.processRecord("base", "table", "rec_1");
    expect(first).toMatchObject({ status: "outcome_unknown" });
    await expect(f.recreate().processRecord("base", "table", "rec_1")).resolves.toMatchObject({ status: "done" });
    expect(f.client.createMessageReaction).toHaveBeenCalledTimes(1);
  });

  it("never resends an uncertain write when absent or when reconciliation is forbidden", async () => {
    const f = await fixture();
    f.client.createMessageReaction.mockRejectedValueOnce(new Error("timeout"));
    await f.runtime.processRecord("base", "table", "rec_1");
    await expect(f.runtime.processRecord("base", "table", "rec_1")).resolves.toMatchObject({ status: "outcome_unknown" });
    f.client.listMessageReactions.mockRejectedValueOnce(new LarkAPIError("forbidden", 403));
    await expect(f.runtime.processRecord("base", "table", "rec_1")).resolves.toMatchObject({ status: "outcome_unknown" });
    expect(f.client.createMessageReaction).toHaveBeenCalledTimes(1);
  });

  it("recovers a persisted dispatch stage after a process crash by reading the Bot reaction", async () => {
    const f = await fixture();
    const job = await f.enqueue();
    await f.store.save(job, "adding", { root_message_id: "om_root" });
    f.setReactions([f.own]);
    await f.recreate().runOnce();
    expect((await f.db.selectFrom("lark_ticket_done_reactions").selectAll().executeTakeFirstOrThrow()).stage).toBe("done");
    expect(f.client.createMessageReaction).not.toHaveBeenCalled();
  });

  it("does not bypass an uncertain reaction when a new source version creates another job", async () => {
    const f = await fixture();
    f.client.createMessageReaction.mockRejectedValueOnce(new Error("timeout"));
    await f.runtime.processRecord("base", "table", "rec_1");
    f.record.updated_time = "2027-01-01T00:02:00.000Z";
    await expect(f.runtime.processRecord("base", "table", "rec_1")).resolves.toMatchObject({
      status: "pending", errorCode: "LARK_TICKET_DONE_REACTION_PENDING",
    });
    expect(f.client.createMessageReaction).toHaveBeenCalledTimes(1);
  });

  it("preserves uncertainty when read-back fails after a successful POST", async () => {
    const f = await fixture();
    f.client.listMessageReactions.mockResolvedValueOnce({ items: [], hasMore: false }).mockRejectedValueOnce(new LarkAPIError("forbidden readback", 403));
    await expect(f.runtime.processRecord("base", "table", "rec_1")).resolves.toMatchObject({ status: "outcome_unknown" });
    await expect(f.runtime.processRecord("base", "table", "rec_1")).resolves.toMatchObject({ status: "done" });
    expect(f.client.createMessageReaction).toHaveBeenCalledTimes(1);
  });

  it("retries a definitely rejected write, including through coordinator error wrapping", async () => {
    const f = await fixture();
    f.client.createMessageReaction.mockRejectedValueOnce(new LarkAPIError("rate limited", 429));
    await expect(f.runtime.processRecord("base", "table", "rec_1")).resolves.toMatchObject({ status: "pending" });
    await expect(f.runtime.processRecord("base", "table", "rec_1")).resolves.toMatchObject({ status: "done" });
    expect(f.client.createMessageReaction).toHaveBeenCalledTimes(2);
  });

  it("cancels queued work when the status or linked topic has changed", async () => {
    const f = await fixture();
    await f.enqueue();
    f.record.fields.Status = "Open";
    await f.runtime.runOnce();
    expect((await f.db.selectFrom("lark_ticket_done_reactions").selectAll().executeTakeFirstOrThrow()).stage).toBe("cancelled");
    expect(f.client.createMessageReaction).not.toHaveBeenCalled();
  });

  it("cancels an outdated message link and leaves newer work eligible", async () => {
    const f = await fixture();
    await f.enqueue();
    f.record.fields["Lark Message Link"] = f.link + "&thread_position=1";
    await f.runtime.runOnce();
    expect((await f.db.selectFrom("lark_ticket_done_reactions").selectAll().executeTakeFirstOrThrow()).stage).toBe("cancelled");
    expect(f.client.createMessageReaction).not.toHaveBeenCalled();
    await expect(f.runtime.processRecord("base", "table", "rec_1")).resolves.toMatchObject({ status: "done" });
  });

  it("isolates a forbidden topic and continues other queued records", async () => {
    const f = await fixture();
    await f.enqueue();
    await f.store.enqueue({ sourceKey: "base/table", appId: "cli_app", recordId: "rec_2", sourceUpdatedAt: f.record.updated_time, messageLink: f.link });
    f.client.batchGetRecords.mockImplementation(async (_base, _table, ids) => ({ records: [{ ...f.record, record_id: ids[0] }], forbidden_record_ids: [], absent_record_ids: [] }));
    f.client.getMessage.mockRejectedValueOnce(new LarkAPIError("no group permission", 403));
    await f.runtime.runOnce();
    const jobs = await f.db.selectFrom("lark_ticket_done_reactions").select("stage").execute();
    expect(jobs.map((job) => job.stage).sort()).toEqual(["blocked", "done"]);
    expect(f.client.createMessageReaction).toHaveBeenCalledTimes(1);
  });

  it("stops automatic retries after five failures and preserves the original action ID", async () => {
    const f = await fixture();
    const initial = await f.enqueue();
    f.client.getMessage.mockRejectedValue(new Error("transient read failure"));
    for (let attempt = 0; attempt < 5; attempt++) await f.runtime.processRecord("base", "table", "rec_1");
    const job = await f.db.selectFrom("lark_ticket_done_reactions").selectAll().executeTakeFirstOrThrow();
    expect(job.attempts).toBe(5);
    expect(job.action_run_id).toBe(initial.action_run_id);
    expect(await f.store.listPending("base/table", "cli_app", "2028-01-01T00:00:00Z")).toEqual([]);
    expect(f.client.createMessageReaction).not.toHaveBeenCalled();
  });

  it("supports a configured target status and topics from other groups", async () => {
    const f = await fixture("Resolved");
    await expect(f.runtime.processRecord("base", "table", "rec_1")).resolves.toMatchObject({ status: "done" });
    expect(f.client.getMessage).toHaveBeenCalledWith("om_root");
    expect(f.client.createMessageReaction).toHaveBeenCalledWith("om_root", "DONE");
  });

  it("rechecks queued work against changed configuration after restart", async () => {
    const f = await fixture();
    await f.enqueue();
    await f.recreate({ targetStatus: "Resolved" }).runOnce();
    expect((await f.db.selectFrom("lark_ticket_done_reactions").selectAll().executeTakeFirstOrThrow()).stage).toBe("cancelled");
    expect(f.client.createMessageReaction).not.toHaveBeenCalled();
  });

  it("previews without initializing progress, enqueueing or writing reactions", async () => {
    const f = await fixture();
    await expect(f.runtime.preview({ baseId: "base", tableId: "table", startTime: "2027-01-01T00:00:00Z", endTime: "2027-01-01T00:10:00Z" })).resolves.toHaveLength(1);
    expect(await f.db.selectFrom("lark_ticket_done_scans").selectAll().execute()).toEqual([]);
    expect(await f.db.selectFrom("lark_ticket_done_reactions").selectAll().execute()).toEqual([]);
    expect(f.client.createMessageReaction).not.toHaveBeenCalled();
    await expect(f.runtime.previewRecord("unknown", "table", "rec_1")).rejects.toThrow("LARK_TICKET_DONE_SOURCE_REQUIRED");
  });

  it("resolves legacy numeric threads and refuses unprovable roots", async () => {
    const f = await fixture();
    await expect(resolveDoneRoot(f.client, "https://applink.larksuite.com/client/thread/open?threadid=12345&chatid=67890")).resolves.toBe("om_root");
    f.client.getThreadMessages.mockResolvedValueOnce({ items: [], hasMore: false });
    await expect(resolveDoneRoot(f.client, "https://applink.larksuite.com/client/thread/open?threadid=12345")).rejects.toThrow("LARK_TICKET_DONE_ROOT_REQUIRED");
    f.client.getMessage.mockResolvedValueOnce({ message_id: "om_root", thread_id: "omt_wrong", chat_id: "oc_othergroup" });
    await expect(resolveDoneRoot(f.client, f.link)).rejects.toThrow("LARK_TICKET_DONE_ROOT_INVALID");
  });

  it("polls at ten minutes and exits when aborted", async () => {
    const f = await fixture();
    vi.useFakeTimers();
    const runOnce = vi.spyOn(f.runtime, "runOnce").mockResolvedValue(undefined);
    const abort = new AbortController();
    const running = f.runtime.run(abort.signal);
    await vi.advanceTimersByTimeAsync(0);
    expect(runOnce).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(runOnce).toHaveBeenCalledTimes(2);
    abort.abort();
    await running;
  });
});
