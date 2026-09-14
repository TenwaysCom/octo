import { createLarkTicketService } from "./lark-ticket.service.js";

const ticket = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };

describe("Lark Ticket service", () => {
  it("loads the Lark shared URL and persists it in the Octo-owned Ticket record", async () => {
    const syncStore = {
      getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "Ticket", syncedAt: "2026-08-12T00:00:00.000Z" }]),
      setLarkBaseTicketSharedUrl: vi.fn(),
    };
    const client = {
      batchGetRecords: vi.fn().mockResolvedValue({
        records: [{ record_id: "rec_1", fields: {}, shared_url: "https://example.larksuite.com/base/app_1?record=rec_1" }],
        forbidden_record_ids: [],
        absent_record_ids: [],
      }),
    };
    const service = createLarkTicketService({
      syncStore,
      getLarkTokenStore: () => ({ get: vi.fn().mockResolvedValue({
        masterUserId: "user_1",
        baseUrl: "https://open.larksuite.com",
        userToken: "token",
        credentialStatus: "active",
      }) }) as never,
      createLarkClient: vi.fn().mockReturnValue(client),
    });

    await expect(service.loadSharedUrl({ masterUserId: "user_1", larkBaseUrl: "https://open.larksuite.com", ticket }))
      .resolves.toEqual({ sharedUrl: "https://example.larksuite.com/base/app_1?record=rec_1" });
    expect(client.batchGetRecords).toHaveBeenCalledWith("app_1", "tbl_1", ["rec_1"], { withSharedUrl: true });
    expect(syncStore.setLarkBaseTicketSharedUrl).toHaveBeenCalledWith({
      ...ticket,
      sharedUrl: "https://example.larksuite.com/base/app_1?record=rec_1",
    });
  });

  it("reuses an already persisted shared URL without making a Lark request", async () => {
    const syncStore = {
      getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{
        ...ticket,
        title: "Ticket",
        sharedUrl: "https://example.larksuite.com/base/app_1?record=rec_1",
        syncedAt: "2026-08-12T00:00:00.000Z",
      }]),
      setLarkBaseTicketSharedUrl: vi.fn(),
    };
    const service = createLarkTicketService({ syncStore });

    await expect(service.loadSharedUrl({ masterUserId: "user_1", larkBaseUrl: "https://open.larksuite.com", ticket }))
      .resolves.toEqual({ sharedUrl: "https://example.larksuite.com/base/app_1?record=rec_1" });
    expect(syncStore.setLarkBaseTicketSharedUrl).not.toHaveBeenCalled();
  });
});
