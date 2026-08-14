import type { Request } from "express";
import { InternalSignedRequestAuthError } from "../../http/internal-signed-request-auth.js";
import { createInternalLarkTicketAiWriteController } from "./internal-lark-ticket-ai.controller.js";

function request(body: unknown): Request {
  return {
    body,
    headers: {},
    socket: { remoteAddress: "10.2.3.4" },
  } as Partial<Request> as Request;
}

describe("internal Lark Ticket AI write controller", () => {
  it("validates the request and writes supported AI fields only through the server service", async () => {
    const authorizer = { authorize: vi.fn().mockResolvedValue({ publicKeyFingerprint: "SHA256:signingKey", principalId: "usr_1" }) };
    const service = { update: vi.fn().mockResolvedValue({ recordId: "rec_1", updated: true, storedInOcto: true }) };
    const controller = createInternalLarkTicketAiWriteController({ authorizer, service });

    await expect(controller.update(request({
      version: "support-qa-lark-update-v1",
      record_id: "rec_1",
      actionRunId: "run_1",
      fields: { "AI分析状态": "已分析", ignored: "not persisted" },
    }))).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: { recordId: "rec_1", updated: true, storedInOcto: true } },
    });
    expect(service.update).toHaveBeenCalledWith({
      recordId: "rec_1",
      fields: { "AI分析状态": "已分析" },
    });
  });

  it("returns a typed error when the SSH/IP authorizer rejects the request", async () => {
    const authorizer = {
      authorize: vi.fn().mockRejectedValue(new InternalSignedRequestAuthError(
        "INTERNAL_REQUEST_SOURCE_IP_FORBIDDEN",
        403,
        "Forbidden",
      )),
    };
    const controller = createInternalLarkTicketAiWriteController({ authorizer, service: { update: vi.fn() } });

    await expect(controller.update(request({}))).resolves.toMatchObject({
      statusCode: 403,
      body: { ok: false, error: { errorCode: "INTERNAL_REQUEST_SOURCE_IP_FORBIDDEN", stage: "server.auth.checked" } },
    });
  });
});
