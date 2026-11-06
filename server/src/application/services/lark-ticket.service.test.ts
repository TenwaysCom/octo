import { createLarkTicketService } from "./lark-ticket.service.js";
import { LarkAPIError } from "../../adapters/lark/lark-client.js";

const ticket = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };

describe("Lark Ticket service", () => {
  it.each([
    [{ records: [], absent_record_ids: ["rec_1"], forbidden_record_ids: [] }, "LARK_TICKET_SOURCE_NOT_FOUND"],
    [{ records: [], absent_record_ids: [], forbidden_record_ids: ["rec_1"] }, "LARK_TICKET_SOURCE_FORBIDDEN"],
    [new LarkAPIError("RecordIdNotFound", 1254043), "LARK_TICKET_SOURCE_NOT_FOUND"],
    [new LarkAPIError("Forbidden", 99991672), "LARK_TICKET_SOURCE_FORBIDDEN"],
    [new LarkAPIError("token expire", 99991677), "LARK_AUTH_REQUIRED"],
    [{ records: [], absent_record_ids: [], forbidden_record_ids: [] }, "LARK_TICKET_SHARED_URL_NOT_FOUND"],
  ])("distinguishes missing source records from inaccessible records", async (result, code) => {
    const service = createLarkTicketService({
      syncStore: {
        getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "Ticket" }]),
        setLarkBaseTicketSharedUrl: vi.fn(),
      },
      getLarkTokenStore: () => ({ get: vi.fn().mockResolvedValue({ userToken: "test", baseUrl: "https://open.larksuite.com" }) }) as never,
      createLarkClient: () => ({ batchGetRecords: async () => {
        if (result instanceof Error) throw result;
        return result;
      } }) as never,
    });
    await expect(service.loadSharedUrl({ masterUserId: "user_1", larkBaseUrl: "https://open.larksuite.com", ticket }))
      .rejects.toMatchObject({ code });
  });

  it("marks only the local Ticket deleted without resolving Lark authorization", async () => {
    const getLarkTokenStore = vi.fn();
    const syncStore = {
      getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "Ticket" }]),
      setLarkBaseTicketSharedUrl: vi.fn(),
      markLarkBaseTicketDeleted: vi.fn().mockResolvedValue({ deletedAt: "2026-11-06T00:00:00Z", deletedBy: "user_1" }),
    };
    const service = createLarkTicketService({ syncStore, getLarkTokenStore });
    await expect(service.markDeleted({ ticket, masterUserId: "user_1", actionRunId: "delete-run" })).resolves.toMatchObject({ deletedAt: "2026-11-06T00:00:00Z" });
    expect(syncStore.markLarkBaseTicketDeleted).toHaveBeenCalledWith({ ...ticket, deletedBy: "user_1" });
    expect(getLarkTokenStore).not.toHaveBeenCalled();
    syncStore.getLarkBaseTicketsForCleaning.mockResolvedValue([]);
    await expect(service.markDeleted({ ticket, masterUserId: "user_1", actionRunId: "delete-run" })).rejects.toMatchObject({ code: "LARK_TICKET_NOT_FOUND" });
    expect(syncStore.markLarkBaseTicketDeleted).toHaveBeenCalledTimes(1);
  });
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
