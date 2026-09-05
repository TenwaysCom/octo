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

  it("routes a signed fixed-snapshot analysis update to the shared analysis service", async () => {
    const authorizer = { authorize: vi.fn().mockResolvedValue({ publicKeyFingerprint: "SHA256:signingKey", principalId: "usr_1" }) };
    const analysisService = {
      update: vi.fn().mockResolvedValue({
        analysisRunId: "analysis_1",
        intentSegmentId: "segment_1",
        snapshotVersion: 3,
        actionRunId: "run_analysis_1",
        updatedAt: "2026-09-01T10:00:00.000Z",
      }),
    };
    const controller = createInternalLarkTicketAiWriteController({
      authorizer,
      service: { update: vi.fn() },
      analysisService,
    });
    const body = {
      version: "support-analysis-v1",
      base_id: "app_1",
      table_id: "tbl_1",
      record_id: "rec_1",
      snapshot_version: 3,
      actionRunId: "run_analysis_1",
      segmentKey: "primary",
      intent: { intentType: "troubleshoot", intentSubtype: "login", confidence: 0.9, summary: "无法登录", keywords: ["login"], evidenceMessageIds: ["om_1"] },
      result: { resolutionStatus: "pending", solutionSummary: null, solutionSteps: [], resolverRef: null, resolvedAt: null, autoResolvable: false, suggestedAutomation: null, confidence: 0.8 },
      quality: { scores: { clarity: 4 }, summary: "等待补充信息", criticalIssues: [], warnings: [] },
    };

    await expect(controller.update(request(body))).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: expect.objectContaining({ analysisRunId: "analysis_1", intentSegmentId: "segment_1" }) },
    });
    expect(analysisService.update).toHaveBeenCalledWith({
      ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
      snapshotVersion: 3,
      actionRunId: "run_analysis_1",
      sourceName: "lark-ticket-support-qa-summarize",
      reviewStatus: "ai_generated",
      reviewerKind: "ai",
      analysis: {
        segmentKey: "primary",
        intent: body.intent,
        result: body.result,
        quality: body.quality,
      },
    });
  });
});
