import { LarkAPIError, type LarkThreadMessage } from "../../adapters/lark/lark-client.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import { PostgresLarkThreadTicketIntakeStore } from "../../adapters/postgres/lark-thread-ticket-intake-store.js";
import type { LarkBaseTicketSyncItem } from "../../adapters/postgres/platform-sync-store.js";
import { createLarkThreadTicketIntakeService, larkThreadTicketSourceKey, type LarkThreadTicketSource } from "./lark-thread-ticket-intake.service.js";
import type { PlatformSyncCoordinator } from "./platform-sync-coordinator.js";
import { logger } from "../../logger.js";

vi.mock("../../logger.js", () => {
  const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), child: () => log };
  return { logger: log };
});

const source: LarkThreadTicketSource = { chatId: "oc_test", baseId: "base", tableId: "table", titleFieldName: "Title", sourceUpdatedAtFieldName: "最后更新时间" };
const root: LarkThreadMessage = { message_id: "om_root", chat_id: source.chatId, thread_id: "omt_root", msg_type: "text",
  content: '{"text":"Promotion cannot be applied"}', create_time: "2026-11-03T00:00:30.000Z", sender: { id: "ou_user", id_type: "open_id", sender_type: "user" } };
const range = { chatId: source.chatId, startTime: "2026-11-03T00:00:00Z", endTime: "2026-11-03T01:00:00Z" };

async function setup() {
  const database = await createTestPostgresDatabase();
  const store = new PostgresLarkThreadTicketIntakeStore(database.db);
  const events: string[] = [];
  const ticket: LarkBaseTicketSyncItem = { baseId: source.baseId, tableId: source.tableId, recordId: "rec_new", title: "Promotion cannot be applied", ticketNumber: "1234", detailDescription: "Promotion cannot be applied", syncedAt: "2026-11-03T00:01:00Z" };
  const client = {
    getChatMessages: vi.fn().mockResolvedValue({ items: [root], hasMore: false }),
    getThreadMessages: vi.fn().mockResolvedValue({ items: [{ ...root, message_id: "om_reply", root_id: root.message_id, parent_id: root.message_id }], hasMore: false }),
    getMessage: vi.fn().mockImplementation(async (id) => ({ ...root, message_id: id, thread_id: id === "om_root" ? root.thread_id : `omt_${id}` })),
    getFields: vi.fn().mockResolvedValue([
      { field_name: "Title", field_id: "title", type: 1 },
      { field_name: "Details Description", field_id: "details", type: 1 },
      { field_name: "Lark Message Link", field_id: "link", type: 15 },
      { field_name: "Requester", field_id: "requester", type: 11 },
    ]),
    listRecords: vi.fn().mockResolvedValue({ records: [], hasMore: false }),
    createRecord: vi.fn().mockImplementation(async () => { events.push("create"); return { record_id: ticket.recordId, fields: {} }; }),
    updateRecord: vi.fn().mockImplementation(async (_base, _table, _record, fields) => { events.push("title"); ticket.title = fields.Title; return { record_id: ticket.recordId, fields }; }),
    replyToMessage: vi.fn().mockImplementation(async () => { events.push("reply"); return { message_id: "om_confirmation" }; }),
    addMessageReaction: vi.fn().mockImplementation(async () => { events.push("reaction"); }),
  };
  const syncService = { syncLarkBaseTicket: vi.fn().mockImplementation(async () => { events.push("sync"); return { synced: 1, recordId: ticket.recordId }; }) };
  const syncStore = { getLarkBaseTicketsForCleaning: vi.fn().mockImplementation(async () => [{ ...ticket }]) };
  const shadowService = { summarizeOne: vi.fn().mockImplementation(async () => { events.push("shadow"); ticket.shadowAi = { status: "ok", summary: "Promotion issue", intentSummary: "Promotion cannot be applied" }; return "ok" as const; }) };
  const titleClient = { createJsonCompletion: vi.fn().mockResolvedValue({ content: '{"title":"促销无法应用到订单"}', model: "test" }) };
  let currentTime = new Date("2026-11-03T00:00:00Z");
  const coordinator = { runExclusive: vi.fn().mockImplementation(async (input) => ({ ...await input.execute({ actionRunId: input.actionRunId ?? "scan", runId: "run", startedAt: currentTime.toISOString() }), runId: "run", actionRunId: input.actionRunId ?? "scan" })) } as Pick<PlatformSyncCoordinator, "runExclusive">;
  const createClient = vi.fn().mockResolvedValue(client);
  const service = createLarkThreadTicketIntakeService({ store, syncStore, syncService, shadowService, titleClient,
    coordinator, createClient, masterUserId: "master", sources: [source], now: () => currentTime });
  return { ...database, store, client, service, syncService, syncStore, shadowService, titleClient, ticket, events, coordinator, createClient,
    setNow: (value: string) => { currentTime = new Date(value); },
    close: async () => { await database.db.destroy(); await database.pool.end(); },
  };
}

describe("Lark thread ticket intake (mock platform + memory PostgreSQL)", () => {
  it("creates, syncs, analyzes, confirms the actual title/number and reacts once for one root", async () => {
    const ctx = await setup();
    try {
      const result = await ctx.service.processMessage(source.chatId, root.message_id);
      expect(result).toMatchObject({ status: "done", recordId: "rec_new" });
      expect(ctx.events).toEqual(["create", "sync", "shadow", "title", "sync", "reply", "reaction"]);
      expect(ctx.client.createRecord).toHaveBeenCalledWith("base", "table", expect.objectContaining({
        Requester: [{ id: "ou_user" }], "Lark Message Link": expect.objectContaining({ link: expect.stringContaining("threadid=omt_root") }),
      }), { clientToken: result.actionRunId });
      expect(ctx.shadowService.summarizeOne).toHaveBeenCalledWith(expect.objectContaining({ recordId: "rec_new" }), result.actionRunId);
      expect(ctx.client.replyToMessage).toHaveBeenCalledWith("om_root", "text", JSON.stringify({ text: "已记录工单\ntitle：促销无法应用到订单\n编号：1234" }), { reply_in_thread: true, uuid: result.actionRunId });
      expect(ctx.client.addMessageReaction).toHaveBeenCalledWith("om_root", "JIAYI");
      await ctx.service.processMessage(source.chatId, root.message_id);
      expect(ctx.client.createRecord).toHaveBeenCalledTimes(1);
      expect(ctx.client.replyToMessage).toHaveBeenCalledTimes(1);
      expect(ctx.client.getChatMessages).not.toHaveBeenCalled();
      expect(await ctx.db.selectFrom("lark_thread_ticket_scans").selectAll().execute()).toEqual([]);
    } finally { await ctx.close(); }
  });

  it("deduplicates by the exact threadid in Base Lark Message Link, including legacy records", async () => {
    const ctx = await setup();
    try {
      ctx.client.listRecords.mockResolvedValueOnce({ records: [
        { record_id: "rec_other", fields: { "Lark Message Link": { link: "https://applink.larksuite.com/client/thread/open?threadid=omt_root_suffix" } } },
        { record_id: "rec_old", fields: { "Lark Message Link": { text: "工单话题", link: "https://applink.larksuite.com/client/thread/open?chatid=oc_test&threadid=omt_root" } } },
      ], hasMore: false });
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "existing", recordId: "rec_old" });
      expect(ctx.client.listRecords).toHaveBeenCalledWith("base", "table", expect.objectContaining({ fieldNames: ["Lark Message Link"], pageSize: 500 }));
      expect(ctx.client.createRecord).not.toHaveBeenCalled();
      expect(ctx.client.replyToMessage).not.toHaveBeenCalled();
    } finally { await ctx.close(); }
  });

  it("resumes a failed analysis without creating a second Base record", async () => {
    const ctx = await setup();
    try {
      ctx.shadowService.summarizeOne.mockRejectedValueOnce(new Error("SHADOW_UNAVAILABLE"));
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "failed", errorCode: "SHADOW_UNAVAILABLE" });
      expect(ctx.client.replyToMessage).not.toHaveBeenCalled();
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "done" });
      expect(ctx.client.createRecord).toHaveBeenCalledTimes(1);
    } finally { await ctx.close(); }
  });

  it("accepts one client thread link, verifies the group and preserves both thread aliases", async () => {
    const ctx = await setup();
    try {
      const link = "https://applink.larksuite.com/client/thread/open?threadid=7703902781853159175&chatid=7538726794547986470&thread_position=1";
      expect(await ctx.service.processThreadLink(source.chatId, link)).toMatchObject({ status: "done" });
      expect(ctx.client.getThreadMessages).toHaveBeenCalledWith("7703902781853159175", { pageSize: 1, sortType: "ByCreateTimeAsc" });
      const payload = ctx.client.createRecord.mock.calls[0][2];
      const savedLink = new URL(payload["Lark Message Link"].link);
      expect(savedLink.searchParams.get("threadid")).toBe("7703902781853159175");
      expect(savedLink.searchParams.get("openthreadid")).toBe(root.thread_id);
      await ctx.service.processMessage(source.chatId, root.message_id);
      expect(ctx.client.createRecord).toHaveBeenCalledTimes(1);
      expect(ctx.client.getChatMessages).not.toHaveBeenCalled();
    } finally { await ctx.close(); }
  });

  it("matches a numeric Base thread link to the canonical Open API thread during automatic intake", async () => {
    const ctx = await setup();
    try {
      ctx.client.listRecords.mockResolvedValueOnce({ records: [{ record_id: "rec_numeric", fields: { "Lark Message Link": "https://applink.larksuite.com/client/thread/open?threadid=7703902781853159175" } }], hasMore: false });
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "existing", recordId: "rec_numeric" });
      expect(ctx.client.getThreadMessages).toHaveBeenCalledWith("7703902781853159175", { pageSize: 1, sortType: "ByCreateTimeAsc" });
      expect(ctx.client.createRecord).not.toHaveBeenCalled();
    } finally { await ctx.close(); }
  });

  it("does not read unrelated legacy threads when the supplied numeric link proves both aliases", async () => {
    const ctx = await setup();
    try {
      ctx.client.listRecords.mockResolvedValueOnce({ records: [{ record_id: "rec_other", fields: { "Lark Message Link": "https://applink.larksuite.com/client/thread/open?threadid=1111111111" } }], hasMore: false });
      expect(await ctx.service.processThreadLink(source.chatId, "https://applink.larksuite.com/client/thread/open?threadid=7703902781853159175")).toMatchObject({ status: "done" });
      expect(ctx.client.getThreadMessages).toHaveBeenCalledTimes(1);
    } finally { await ctx.close(); }
  });

  it("rejects conflicting client/open thread IDs instead of attaching the wrong source link", async () => {
    const ctx = await setup();
    try {
      await expect(ctx.service.processThreadLink(source.chatId, "https://applink.larksuite.com/client/thread/open?threadid=7703902781853159175&openthreadid=omt_another")).rejects.toThrow("SOURCE_INVALID");
      expect(ctx.client.createRecord).not.toHaveBeenCalled();
    } finally { await ctx.close(); }
  });

  it("checks every page of Base links before deciding to create", async () => {
    const ctx = await setup();
    try {
      ctx.client.listRecords.mockResolvedValueOnce({ records: [], hasMore: true, nextPageToken: "base_page2" })
        .mockResolvedValueOnce({ records: [{ record_id: "rec_legacy", fields: { "Lark Message Link": { text: "话题", link: "https://applink.larksuite.com/client/thread/open?threadid=omt_root" } } }], hasMore: false });
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "existing", recordId: "rec_legacy" });
      expect(ctx.client.listRecords).toHaveBeenLastCalledWith("base", "table", expect.objectContaining({ pageToken: "base_page2" }));
      expect(ctx.client.createRecord).not.toHaveBeenCalled();
    } finally { await ctx.close(); }
  });

  it("does not create if the authoritative Base link scan fails", async () => {
    const ctx = await setup();
    try {
      ctx.client.listRecords.mockRejectedValueOnce(new Error("NETWORK_ERROR"));
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "failed", errorCode: "NETWORK_ERROR" });
      expect(ctx.client.createRecord).not.toHaveBeenCalled();
    } finally { await ctx.close(); }
  });

  it.each([
    ["createRecord", 99991400, "pending", "PLATFORM_RATE_LIMITED"],
    ["createRecord", 403, "pending", "PLATFORM_PERMISSION_DENIED"],
    ["replyToMessage", 99991400, "titled", "PLATFORM_RATE_LIMITED"],
    ["replyToMessage", 403, "titled", "PLATFORM_PERMISSION_DENIED"],
  ] as const)("retries a definite %s rejection (%s) using the original idempotency key", async (method, code, retryStage, errorCode) => {
    const ctx = await setup();
    try {
      ctx.client[method].mockRejectedValueOnce(new LarkAPIError("Rejected", code));
      const first = await ctx.service.processMessage(source.chatId, root.message_id);
      expect(first).toMatchObject({ status: "failed", stage: `server.thread_ticket.${retryStage}`, errorCode });
      const failed = await ctx.store.get(larkThreadTicketSourceKey(source), root.thread_id!);
      expect(failed).toMatchObject({ stage: retryStage, attempts: 1, action_run_id: first.actionRunId });
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "done", actionRunId: first.actionRunId });
      expect(ctx.client.createRecord).toHaveBeenCalledTimes(method === "createRecord" ? 2 : 1);
      expect(ctx.shadowService.summarizeOne).toHaveBeenCalledTimes(1);
      expect(ctx.client.updateRecord).toHaveBeenCalledTimes(1);
      expect(ctx.client.replyToMessage).toHaveBeenCalledTimes(method === "replyToMessage" ? 2 : 1);
      if (method === "createRecord") {
        expect(ctx.client.createRecord.mock.calls.map((call) => call[3])).toEqual([{ clientToken: first.actionRunId }, { clientToken: first.actionRunId }]);
      } else {
        expect(ctx.client.replyToMessage.mock.calls.map((call) => call[3])).toEqual([
          { reply_in_thread: true, uuid: first.actionRunId }, { reply_in_thread: true, uuid: first.actionRunId },
        ]);
      }
    } finally { await ctx.close(); }
  });

  it.each(["createRecord", "replyToMessage"] as const)("limits automatic %s rejection retries to five and still allows a manual retry", async (method) => {
    const ctx = await setup();
    try {
      const run = await ctx.store.enqueue(larkThreadTicketSourceKey(source), root.thread_id!, root.message_id);
      ctx.client[method].mockRejectedValue(new LarkAPIError("Rate limited", 99991400));
      for (let attempt = 1; attempt <= 5; attempt++) {
        expect(await ctx.service.runOnce()).toEqual([expect.objectContaining({ status: "failed", actionRunId: run.action_run_id })]);
        expect(await ctx.store.get(run.source_key, run.thread_id)).toMatchObject({ attempts: attempt, stage: method === "createRecord" ? "pending" : "titled" });
      }
      expect(await ctx.service.runOnce()).toEqual([]);
      expect(ctx.client[method]).toHaveBeenCalledTimes(5);
      if (method === "createRecord") ctx.client.createRecord.mockResolvedValueOnce({ record_id: "rec_new", fields: {} });
      else ctx.client.replyToMessage.mockResolvedValueOnce({ message_id: "om_confirmation" });
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "done", actionRunId: run.action_run_id });
      expect(ctx.client[method]).toHaveBeenCalledTimes(6);
    } finally { await ctx.close(); }
  });

  it.each([
    ["createRecord", new Error("TIMEOUT")], ["replyToMessage", new Error("TIMEOUT")],
    ["createRecord", new LarkAPIError("Server error", 500)], ["replyToMessage", new LarkAPIError("Server error", 500)],
    ["createRecord", new LarkAPIError("Request timeout", 408)], ["replyToMessage", new LarkAPIError("Request timeout", 408)],
    ["createRecord", new LarkAPIError("Unknown outcome")], ["replyToMessage", new LarkAPIError("Unknown outcome")],
  ] as const)("does not repeat %s after an uncertain write (%s)", async (method, error) => {
    const ctx = await setup();
    try {
      ctx.client[method].mockRejectedValueOnce(error);
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "outcome_unknown" });
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "outcome_unknown" });
      expect(ctx.client[method]).toHaveBeenCalledTimes(1);
      expect(ctx.client.addMessageReaction).not.toHaveBeenCalled();
    } finally { await ctx.close(); }
  });

  it("retries only the reaction when confirmation already succeeded", async () => {
    const ctx = await setup();
    try {
      ctx.client.addMessageReaction.mockRejectedValueOnce(new Error("RATE_LIMITED"));
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "failed" });
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "done" });
      expect(ctx.client.replyToMessage).toHaveBeenCalledTimes(1);
      expect(ctx.client.createRecord).toHaveBeenCalledTimes(1);
      expect(ctx.client.addMessageReaction).toHaveBeenCalledTimes(2);
    } finally { await ctx.close(); }
  });

  it.each(["missing_number", "title_readback", "invalid_title"])("does not confirm when %s fails", async (reason) => {
    const ctx = await setup();
    try {
      if (reason === "missing_number") ctx.ticket.ticketNumber = undefined;
      if (reason === "title_readback") ctx.client.updateRecord.mockResolvedValue({ record_id: "rec_new", fields: {} });
      if (reason === "invalid_title") ctx.titleClient.createJsonCompletion.mockResolvedValue({ content: '{"title":"bad\\ntitle"}', model: "test" });
      expect(await ctx.service.processMessage(source.chatId, root.message_id)).toMatchObject({ status: "failed" });
      expect(ctx.client.replyToMessage).not.toHaveBeenCalled();
      expect(ctx.client.addMessageReaction).not.toHaveBeenCalled();
    } finally { await ctx.close(); }
  });

  it("rejects a root from a different chat and replies used as a single-ticket input", async () => {
    const ctx = await setup();
    try {
      ctx.client.getMessage.mockResolvedValueOnce({ ...root, chat_id: "oc_other" });
      await expect(ctx.service.processMessage(source.chatId, root.message_id)).rejects.toThrow("SOURCE_INVALID");
      ctx.client.getMessage.mockResolvedValueOnce({ ...root, root_id: "om_another" });
      await expect(ctx.service.processMessage(source.chatId, root.message_id)).rejects.toThrow("SOURCE_INVALID");
      expect(ctx.client.createRecord).not.toHaveBeenCalled();
    } finally { await ctx.close(); }
  });

  it("starts automatic discovery at first activation and paginates only new user topics", async () => {
    const ctx = await setup();
    try {
      await ctx.service.runOnce();
      expect(ctx.client.getChatMessages).not.toHaveBeenCalled();
      ctx.setNow("2026-11-03T00:02:00Z");
      ctx.client.getChatMessages.mockResolvedValueOnce({ items: [
        { ...root, create_time: "2026-11-02T23:59:00Z" },
        { ...root, root_id: "om_other" }, { ...root, sender: { sender_type: "app" } },
      ], hasMore: true, pageToken: "page2" }).mockResolvedValueOnce({ items: [root], hasMore: false });
      const results = await ctx.service.runOnce();
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ status: "done" });
      expect(ctx.client.getChatMessages).toHaveBeenNthCalledWith(2, source.chatId, expect.objectContaining({ pageToken: "page2" }));
      expect(ctx.client.createRecord).toHaveBeenCalledTimes(1);
      expect(await ctx.store.initializeScan(larkThreadTicketSourceKey(source), "ignored")).toEqual({ watermark: "2026-11-03T00:02:00.000Z", startedAt: "2026-11-03T00:00:00.000Z" });
    } finally { await ctx.close(); }
  });

  it("does not advance the automatic watermark after incomplete pagination", async () => {
    const ctx = await setup();
    try {
      await ctx.service.runOnce();
      ctx.setNow("2026-11-03T00:02:00Z");
      ctx.client.getChatMessages.mockResolvedValueOnce({ items: [root], hasMore: true });
      await ctx.service.runOnce();
      expect((await ctx.store.initializeScan(larkThreadTicketSourceKey(source), "ignored")).watermark).toBe("2026-11-03T00:00:00.000Z");
      expect(ctx.client.createRecord).not.toHaveBeenCalled();
    } finally { await ctx.close(); }
  });

  it("uses the scan audit ID for discovery and its failure log", async () => {
    const ctx = await setup();
    try {
      await ctx.service.runOnce();
      ctx.setNow("2026-11-03T00:02:00Z");
      ctx.client.getChatMessages.mockRejectedValueOnce(new LarkAPIError("Forbidden", 403));
      await ctx.service.runOnce();
      const audit = vi.mocked(ctx.coordinator.runExclusive).mock.calls.at(-1)![0];
      expect(audit).toMatchObject({ trigger: "scheduled", actionRunId: expect.any(String) });
      expect(ctx.createClient).toHaveBeenCalledWith(source, audit.actionRunId);
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
        actionRunId: audit.actionRunId, sourceKey: larkThreadTicketSourceKey(source),
        layer: "server", stage: "server.thread_ticket.scan", errorCode: "PLATFORM_PERMISSION_DENIED",
      }), "LARK_THREAD_TICKET_SCAN_FAILED");
    } finally { await ctx.close(); }
  });

  it("links each persisted ticket execution to the parent interval scan", async () => {
    const ctx = await setup();
    try {
      const response = await ctx.service.scanRange({ ...range, apply: true, actionRunId: "request_1" });
      const [ticket] = response.results;
      expect(ctx.coordinator.runExclusive).toHaveBeenCalledWith(expect.objectContaining({ actionRunId: "request_1", trigger: "manual" }));
      expect(ctx.createClient).toHaveBeenCalledWith(source, "request_1");
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
        actionRunId: ticket!.actionRunId, parentActionRunId: "request_1", threadId: root.thread_id,
      }), "LARK_THREAD_TICKET_COMPLETED");
    } finally { await ctx.close(); }
  });

  it("previews a bounded interval without creating or enqueueing and never touches the automatic cursor", async () => {
    const ctx = await setup();
    try {
      ctx.client.getChatMessages.mockResolvedValueOnce({ items: [root,
        { ...root, message_id: "om_before", thread_id: "omt_before", create_time: "2026-11-02T23:59:59Z" },
        { ...root, message_id: "om_end", thread_id: "omt_end", create_time: range.endTime },
      ], hasMore: false });
      expect(await ctx.service.scanRange(range)).toMatchObject({ apply: false, matched: 1, results: [] });
      expect(ctx.client.getChatMessages).toHaveBeenCalledWith(source.chatId, expect.objectContaining({ startTime: "1793664000", endTime: "1793667600" }));
      expect(ctx.client.createRecord).not.toHaveBeenCalled();
      expect(await ctx.db.selectFrom("lark_thread_ticket_intakes").selectAll().execute()).toEqual([]);
      expect(await ctx.db.selectFrom("lark_thread_ticket_scans").selectAll().execute()).toEqual([]);
    } finally { await ctx.close(); }
  });

  it("applies only interval candidates within maxTickets, leaving no queued excess or unrelated work", async () => {
    const ctx = await setup();
    try {
      await ctx.store.enqueue(larkThreadTicketSourceKey(source), "omt_unrelated", "om_unrelated");
      ctx.client.getChatMessages.mockResolvedValueOnce({ items: [root, { ...root, message_id: "om_second", thread_id: "omt_second" }], hasMore: false });
      expect(await ctx.service.scanRange({ ...range, apply: true, maxTickets: 1 })).toMatchObject({ matched: 2, remaining: 1, results: [expect.objectContaining({ status: "done" })] });
      expect(ctx.client.createRecord).toHaveBeenCalledTimes(1);
      expect(await ctx.store.get(larkThreadTicketSourceKey(source), "omt_second")).toBeUndefined();
      expect((await ctx.store.get(larkThreadTicketSourceKey(source), "omt_unrelated"))?.stage).toBe("pending");
      expect(await ctx.db.selectFrom("lark_thread_ticket_scans").selectAll().execute()).toEqual([]);
    } finally { await ctx.close(); }
  });
});
