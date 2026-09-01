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

  it("updates intent, result, and quality through the authenticated Ticket endpoint", async () => {
    const analysisService = {
      update: vi.fn().mockResolvedValue({
        analysisRunId: "run_1",
        intentSegmentId: "segment_1",
        snapshotVersion: 3,
        updatedAt: "2026-09-01T10:00:00.000Z",
      }),
    };
    const controller = createWebLarkTicketController({
      analysisService: analysisService as never,
      resolveSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", user: {} }),
    });
    const body = {
      baseId: "app_1",
      tableId: "tbl_1",
      snapshotVersion: 3,
      actionRunId: "action_1",
      reviewStatus: "approved",
      segmentKey: "primary",
      intent: { intentType: "troubleshoot", intentSubtype: "login", confidence: 0.9, summary: "无法登录", keywords: ["login"], evidenceMessageIds: ["om_1"] },
      result: { resolutionStatus: "resolved", solutionSummary: "重置后恢复", solutionSteps: ["重置账号"], resolverRef: "ou_support", resolvedAt: "2026-09-01T09:30:00.000Z", autoResolvable: false, suggestedAutomation: null, confidence: 0.95 },
      quality: { scores: { clarity: 4 }, summary: "处理清晰", criticalIssues: [], warnings: [] },
    };

    await expect(controller.updateSupportAnalysis({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      body,
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: expect.objectContaining({ analysisRunId: "run_1", intentSegmentId: "segment_1" }) },
    });
    expect(analysisService.update).toHaveBeenCalledWith(expect.objectContaining({
      ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
      reviewerKind: "human",
      reviewStatus: "approved",
      analysis: expect.objectContaining({
        intent: expect.objectContaining({ intentType: "troubleshoot" }),
        result: expect.objectContaining({ resolutionStatus: "resolved" }),
        quality: expect.objectContaining({ summary: "处理清晰" }),
      }),
    }));
  });
});
