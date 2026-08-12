import { describe, expect, it, vi } from "vitest";
import { createWebLarkTicketAiController } from "./lark-ticket-ai.controller.js";

describe("web Lark Ticket AI controller", () => {
  it("uses only the server-resolved web identity when listing Ticket sessions", async () => {
    const service = {
      listSessions: vi.fn().mockResolvedValue([{ sessionId: "sess_1", title: "Create PRD", updatedAt: "2026-08-12T00:00:00.000Z" }]),
    };
    const controller = createWebLarkTicketAiController({
      service: service as never,
      resolveSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "usr_1", baseUrl: "https://open.larksuite.com", user: {} }),
      resolveOperatorLarkId: vi.fn().mockResolvedValue("ou_1"),
    });

    await expect(controller.list({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      query: { baseId: "app_1", tableId: "tbl_1" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: { sessions: [{ sessionId: "sess_1", title: "Create PRD", updatedAt: "2026-08-12T00:00:00.000Z" }] } },
    });
    expect(service.listSessions).toHaveBeenCalledWith({
      operatorLarkId: "ou_1",
      ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
    });
  });

  it("rejects Ticket session reads without a valid web session", async () => {
    const controller = createWebLarkTicketAiController({
      resolveSession: vi.fn().mockResolvedValue({ ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session." }),
    });
    await expect(controller.list({ cookieHeader: undefined, recordId: "rec_1", query: {} })).resolves.toEqual({
      statusCode: 401,
      body: { ok: false, error: { errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session." } },
    });
  });
});
