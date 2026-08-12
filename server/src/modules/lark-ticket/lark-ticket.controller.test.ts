import { createWebLarkTicketController } from "./lark-ticket.controller.js";

describe("web Lark Ticket controller", () => {
  it("uses the server-resolved Web identity to load and persist a Ticket shared URL", async () => {
    const service = { loadSharedUrl: vi.fn().mockResolvedValue({ sharedUrl: "https://example.larksuite.com/base/app_1?record=rec_1" }) };
    const controller = createWebLarkTicketController({
      service: service as never,
      resolveSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", user: {} }),
    });

    await expect(controller.loadSharedUrl({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      query: { baseId: "app_1", tableId: "tbl_1" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: { sharedUrl: "https://example.larksuite.com/base/app_1?record=rec_1" } },
    });
    expect(service.loadSharedUrl).toHaveBeenCalledWith({
      masterUserId: "user_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
    });
  });

  it("requires the opaque Web session", async () => {
    const controller = createWebLarkTicketController({
      resolveSession: vi.fn().mockResolvedValue({ ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session." }),
    });

    await expect(controller.loadSharedUrl({ cookieHeader: undefined, recordId: "rec_1", query: {} })).resolves.toEqual({
      statusCode: 401,
      body: { ok: false, error: { errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session." } },
    });
  });
});
