import { createAcpTicketThreadContextService } from "./acp-ticket-thread-context.service.js";

describe("ACP Ticket thread context service", () => {
  it("loads the synchronized Ticket and returns the ensured message snapshot", async () => {
    const ticket = {
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      title: "Ticket",
      ticketStatus: "In Progress",
      syncedAt: "2026-08-26T10:00:00.000Z",
    };
    const syncStore = {
      getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([ticket]),
    };
    const threadContextService = {
      ensure: vi.fn().mockResolvedValue({
        decision: "incremental",
        source: "lark",
        threadId: "thread_1",
        snapshot: {
          messages: [{ messageId: "om_1", content: "hello" }],
          snapshotVersion: 3,
          historyComplete: true,
          lastSuccessfulSyncAt: "2026-08-26T12:00:00.000Z",
        },
      }),
    };
    const service = createAcpTicketThreadContextService({
      syncStore: syncStore as never,
      threadContextService: threadContextService as never,
    });

    await expect(service.getMessages({
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
    })).resolves.toMatchObject({
      schemaVersion: 1,
      decision: "incremental",
      source: "lark",
      snapshotVersion: 3,
      messages: [{ messageId: "om_1", content: "hello" }],
    });
    expect(threadContextService.ensure).toHaveBeenCalledWith({
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket,
    });
  });
});
