import type {
  LarkTicketThreadSnapshot,
  LarkTicketThreadSyncStore,
} from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import {
  createLarkTicketThreadContextService,
  decideLarkTicketThreadSync,
  parseLarkThreadId,
} from "./lark-ticket-thread-context.service.js";

const ref = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };
const messageLink = "https://applink.larksuite.com/client/thread/open?threadid=thread_1&chatid=chat_1";
const now = new Date("2026-08-26T12:00:00.000Z");

function createSnapshot(overrides: Partial<LarkTicketThreadSnapshot> = {}): LarkTicketThreadSnapshot {
  return {
    ...ref,
    messageLink,
    threadId: "thread_1",
    messages: [{ messageId: "root_1", createdAt: "2026-08-26T09:00:00.000Z", content: "Root" }],
    snapshotVersion: 1,
    historyComplete: true,
    watermarkCreatedAt: "2026-08-26T09:00:00.000Z",
    watermarkMessageId: "root_1",
    lastCheckedAt: "2026-08-26T11:55:00.000Z",
    lastSuccessfulSyncAt: "2026-08-26T11:55:00.000Z",
    lastFullReconciledAt: "2026-08-26T11:00:00.000Z",
    dirty: false,
    createdAt: "2026-08-26T11:00:00.000Z",
    updatedAt: "2026-08-26T11:55:00.000Z",
    ...overrides,
  };
}

function createStore(initial?: LarkTicketThreadSnapshot) {
  let snapshot = initial;
  const store: LarkTicketThreadSyncStore = {
    get: vi.fn(async () => snapshot),
    saveSuccessfulSync: vi.fn(async (input) => {
      const changed = !snapshot || JSON.stringify(snapshot.messages) !== JSON.stringify(input.messages);
      snapshot = createSnapshot({
        messageLink: input.messageLink,
        threadId: input.threadId,
        messages: input.messages,
        snapshotVersion: snapshot ? snapshot.snapshotVersion + (changed ? 1 : 0) : 1,
        historyComplete: input.historyComplete,
        watermarkCreatedAt: input.watermarkCreatedAt,
        watermarkMessageId: input.watermarkMessageId,
        lastCheckedAt: input.checkedAt,
        lastSuccessfulSyncAt: input.checkedAt,
        lastFullReconciledAt: input.fullReconciledAt ?? snapshot?.lastFullReconciledAt,
        dirty: false,
        frozenAt: input.frozenStatus ? input.checkedAt : undefined,
        frozenStatus: input.frozenStatus,
        createdAt: snapshot?.createdAt ?? input.checkedAt,
        updatedAt: input.checkedAt,
      });
      return snapshot;
    }),
    markChecked: vi.fn(async () => snapshot),
    markFrozen: vi.fn(async (_ticket, status, frozenAt) => {
      snapshot = snapshot ? { ...snapshot, frozenAt, frozenStatus: status, updatedAt: frozenAt } : undefined;
      return snapshot;
    }),
    markDirty: vi.fn(async () => undefined),
    markFailure: vi.fn(async () => undefined),
  };
  return { store, getSnapshot: () => snapshot };
}

function createTicket(ticketStatus = "In Progress") {
  return {
    ...ref,
    title: "Ticket",
    ticketStatus,
    larkMessageLink: messageLink,
    syncedAt: "2026-08-26T10:00:00.000Z",
  };
}

describe("Lark Ticket thread context ensure", () => {
  it("extracts the thread id and skips Lark for a fresh active snapshot", async () => {
    expect(parseLarkThreadId(messageLink)).toBe("thread_1");
    const { store } = createStore(createSnapshot());
    const buildClient = vi.fn();
    const service = createLarkTicketThreadContextService({ store, buildClient, now: () => now });

    await expect(service.ensure({
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket: createTicket(),
    })).resolves.toMatchObject({ decision: "cache", source: "cache", threadId: "thread_1" });
    expect(buildClient).not.toHaveBeenCalled();
  });

  it.each(["Finish", "Cancelled", "Rejected"])(
    "freezes an already complete %s snapshot without calling Lark",
    async (ticketStatus) => {
      const { store } = createStore(createSnapshot({ frozenAt: undefined, frozenStatus: undefined }));
      const buildClient = vi.fn();
      const service = createLarkTicketThreadContextService({ store, buildClient, now: () => now });

      const result = await service.ensure({
        masterUserId: "usr_1",
        larkBaseUrl: "https://open.larksuite.com",
        ticket: createTicket(ticketStatus),
      });

      expect(result).toMatchObject({ decision: "cache", source: "cache" });
      expect(result.snapshot).toMatchObject({ frozenStatus: ticketStatus, frozenAt: now.toISOString() });
      expect(buildClient).not.toHaveBeenCalled();
    },
  );

  it("fully fetches an uncached terminal thread once, then reuses the frozen snapshot", async () => {
    const { store } = createStore();
    const client = {
      getMessage: vi.fn().mockResolvedValue({
        message_id: "root_1",
        msg_type: "text",
        create_time: "2026-08-26T09:00:00.000Z",
        body: undefined,
        content: JSON.stringify({ text: "Root" }),
      }),
      getThreadMessages: vi.fn().mockResolvedValue({
        items: [{
          message_id: "reply_1",
          root_id: "root_1",
          msg_type: "text",
          create_time: "2026-08-26T09:10:00.000Z",
          content: JSON.stringify({ text: "Reply" }),
        }],
        hasMore: false,
      }),
    };
    const buildClient = vi.fn().mockResolvedValue({ client });
    const service = createLarkTicketThreadContextService({ store, buildClient, now: () => now });
    const input = {
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket: createTicket("Finish"),
    };

    const first = await service.ensure(input);
    const second = await service.ensure(input);

    expect(first).toMatchObject({ decision: "full", source: "lark" });
    expect(first.snapshot).toMatchObject({
      historyComplete: true,
      snapshotVersion: 1,
      frozenStatus: "Finish",
    });
    expect(first.snapshot?.messages.map((message) => message.messageId)).toEqual(["root_1", "reply_1"]);
    expect(second).toMatchObject({ decision: "cache", source: "cache" });
    expect(buildClient).toHaveBeenCalledTimes(1);
    expect(client.getThreadMessages).toHaveBeenCalledTimes(1);
    expect(client.getMessage).toHaveBeenCalledWith("root_1");
    expect(client.getMessage).not.toHaveBeenCalledWith("thread_1");
  });

  it("uses the watermark overlap for an expired active snapshot and merges incrementally", async () => {
    const watermark = "2026-08-26T09:00:00.000Z";
    const { store } = createStore(createSnapshot({
      watermarkCreatedAt: watermark,
      lastCheckedAt: "2026-08-26T10:00:00.000Z",
      lastFullReconciledAt: "2026-08-26T11:00:00.000Z",
    }));
    const client = {
      getMessage: vi.fn(),
      getThreadMessages: vi.fn().mockResolvedValue({
        items: [{
          message_id: "reply_2",
          msg_type: "text",
          create_time: "2026-08-26T11:30:00.000Z",
          content: JSON.stringify({ text: "New reply" }),
        }],
        hasMore: false,
      }),
    };
    const service = createLarkTicketThreadContextService({
      store,
      buildClient: vi.fn().mockResolvedValue({ client }),
      now: () => now,
      maxAgeMs: 10 * 60 * 1000,
      incrementalOverlapSeconds: 60,
    });

    const result = await service.ensure({
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket: createTicket(),
    });

    expect(result).toMatchObject({ decision: "incremental", source: "lark" });
    expect(result.snapshot?.messages.map((message) => message.messageId)).toEqual(["root_1", "reply_2"]);
    expect(client.getMessage).not.toHaveBeenCalled();
    expect(client.getThreadMessages).toHaveBeenCalledWith("thread_1", expect.objectContaining({
      startTime: String(Math.floor(Date.parse(watermark) / 1000) - 60),
      sortType: "ByCreateTimeAsc",
    }));
  });

  it("requires a full fetch when a frozen Ticket is reopened", () => {
    expect(decideLarkTicketThreadSync({
      threadId: "thread_1",
      ticketStatus: "In Progress",
      snapshot: createSnapshot({ frozenAt: "2026-08-26T11:58:00.000Z", frozenStatus: "Finish" }),
      now,
      maxAgeMs: 10 * 60 * 1000,
      fullReconcileAgeMs: 24 * 60 * 60 * 1000,
    })).toBe("incremental");
  });
});
