import type { Request } from "express";
import { InternalSignedRequestAuthError } from "../../http/internal-signed-request-auth.js";
import { createInternalAcpTicketContextController } from "./internal-acp-ticket-context.controller.js";

function request(body: unknown): Request {
  return {
    body,
    headers: {},
    socket: { remoteAddress: "10.2.3.4" },
  } as Partial<Request> as Request;
}

describe("internal ACP Ticket context controller", () => {
  it("takes the master user from the signed principal and delegates ensure through the service", async () => {
    const authorizer = {
      authorize: vi.fn().mockResolvedValue({
        publicKeyFingerprint: "SHA256:signingKey",
        principalId: "usr_1",
      }),
    };
    const data = {
      schemaVersion: 1,
      ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
      decision: "cache",
      source: "cache",
      historyComplete: true,
      messages: [{ messageId: "om_1", content: "hello" }],
    };
    const service = { getMessages: vi.fn().mockResolvedValue(data) };
    const controller = createInternalAcpTicketContextController({ authorizer, service: service as never });

    await expect(controller.getMessages(request({
      version: "ticket-thread-context-v1",
      base_id: "app_1",
      table_id: "tbl_1",
      record_id: "rec_1",
      lark_base_url: "https://open.larksuite.com",
      actionRunId: "run_1",
    }))).resolves.toEqual({ statusCode: 200, body: { ok: true, data } });
    expect(service.getMessages).toHaveBeenCalledWith({
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
    });
  });

  it("returns a typed error when the internal request signature is rejected", async () => {
    const authorizer = {
      authorize: vi.fn().mockRejectedValue(new InternalSignedRequestAuthError(
        "INTERNAL_REQUEST_SOURCE_IP_FORBIDDEN",
        403,
        "Forbidden",
      )),
    };
    const controller = createInternalAcpTicketContextController({
      authorizer,
      service: { getMessages: vi.fn() },
    });

    await expect(controller.getMessages(request({}))).resolves.toMatchObject({
      statusCode: 403,
      body: {
        ok: false,
        error: { errorCode: "INTERNAL_REQUEST_SOURCE_IP_FORBIDDEN", stage: "server.auth.checked" },
      },
    });
  });
});
