import { createWebLarkTicketController, registerWebLarkTicketRoutes } from "./lark-ticket.controller.js";
import { LarkTicketError } from "../../application/services/lark-ticket.service.js";

describe("web Lark Ticket controller", () => {
  const deletionInput = { cookieHeader: "octo_web_session=s", recordId: "rec_1", body: { baseId: "app_1", tableId: "tbl_1", actionRunId: "delete-run" } };
  const pmSession = { ok: true, role: "pm", masterUserId: "server-user", baseUrl: "https://open.larksuite.com", user: {} };

  it("registers the local deletion endpoint", () => {
    const app = { post: vi.fn(), get: vi.fn(), put: vi.fn() };
    registerWebLarkTicketRoutes(app as never);
    expect(app.post).toHaveBeenCalledWith("/api/web/lark-tickets/:recordId/mark-deleted", expect.any(Function));
  });

  it("uses only the Web identity for deletion and returns action diagnostics", async () => {
    const service = { markDeleted: vi.fn().mockResolvedValue({ deletedAt: "2026-11-06T00:00:00Z", deletedBy: "server-user" }) };
    const controller = createWebLarkTicketController({ service: service as never, resolveSession: vi.fn().mockResolvedValue(pmSession) });
    expect(await controller.markDeleted(deletionInput)).toMatchObject({ statusCode: 200, body: { ok: true, data: { deletedAt: "2026-11-06T00:00:00Z", actionRunId: "delete-run", layer: "server", module: "lark-ticket", stage: "server.ticket.mark-deleted" } } });
    expect(service.markDeleted).toHaveBeenCalledWith({ ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" }, masterUserId: "server-user", actionRunId: "delete-run" });
    expect(await controller.markDeleted({ ...deletionInput, body: { ...deletionInput.body, masterUserId: "forged-user" } })).toMatchObject({ statusCode: 400 });
    expect(service.markDeleted).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ ok: false, errorCode: "UNAUTHENTICATED" }, 401], [{ ...pmSession, role: "dev" }, 403],
  ])("denies unauthorized deletion (%#)", async (session, statusCode) => {
    const service = { markDeleted: vi.fn() };
    const controller = createWebLarkTicketController({ service: service as never, resolveSession: vi.fn().mockResolvedValue(session) });
    expect(await controller.markDeleted(deletionInput)).toMatchObject({ statusCode, body: { ok: false, error: { actionRunId: "delete-run", layer: "server" } } });
    expect(service.markDeleted).not.toHaveBeenCalled();
  });

  it.each([["LARK_TICKET_SOURCE_NOT_FOUND", 404], ["LARK_TICKET_SOURCE_FORBIDDEN", 403], ["LARK_AUTH_REQUIRED", 401]] as const)("exposes %s for link errors", async (code, statusCode) => {
    const controller = createWebLarkTicketController({ service: { loadSharedUrl: vi.fn().mockRejectedValue(new LarkTicketError(code, "safe guidance", statusCode)) } as never,
      resolveSession: vi.fn().mockResolvedValue(pmSession) });
    expect(await controller.loadSharedUrl({ ...deletionInput, query: deletionInput.body })).toMatchObject({ statusCode, body: { ok: false, error: { errorCode: code, errorMessage: "safe guidance", actionRunId: "delete-run" } } });
  });
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
      body: { ok: false, error: { errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session.", layer: "server", module: "lark-ticket", stage: "server.ticket.shared-url" } },
    });
  });

  it("returns the redacted prepared messages from the stored Ticket snapshot", async () => {
    const threadStore = {
      get: vi.fn().mockResolvedValue({
        threadId: "thread_1", messageLink: "https://open.larksuite.com/client/chat/thread_1", snapshotVersion: 3, historyComplete: true,
        preparedMessages: [{ messageId: "om_1", senderRole: "user", text: "无法登录", hasArtifact: false }],
      }),
    };
    const controller = createWebLarkTicketController({
      threadStore: threadStore as never,
      resolveSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", user: {} }),
    });

    await expect(controller.loadPreparedMessages({
      cookieHeader: "octo_web_session=session_1", recordId: "rec_1", query: { baseId: "app_1", tableId: "tbl_1" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: expect.objectContaining({ snapshotVersion: 3, messages: [{ messageId: "om_1", senderRole: "user", text: "无法登录", hasArtifact: false }] }) },
    });
    expect(threadStore.get).toHaveBeenCalledWith({ baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" });
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

it("binds Eval creation, draft saves and My evals to the Web identity", async () => {
  const service = { create: vi.fn().mockResolvedValue({ id: "s" }), update: vi.fn().mockResolvedValue({ id: "s" }), list: vi.fn().mockResolvedValue([]) };
  const controller = createWebLarkTicketController({ evalDatasetService: service as never,
    resolveSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "alice", role: "dev", user: { larkName: "Alice" } }) });
  expect((await controller.createEvalSample({ cookieHeader: "session", recordId: "r", body: { baseId: "b", tableId: "t", actionRunId: "create" } })).statusCode).toBe(200);
  expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ reviewer: { id: "alice", name: "Alice" } }));
  expect((await controller.updateEvalSample({ cookieHeader: "session", sampleId: "s", body: { datasetStatus: "draft", actionRunId: "save", expectedUpdatedAt: "2026-09-21T00:00:00.000Z" } })).statusCode).toBe(200);
  expect(service.update).toHaveBeenCalledWith(expect.objectContaining({ reviewer: { id: "alice", name: "Alice" }, update: expect.objectContaining({ datasetStatus: "draft" }) }));
  expect((await controller.listEvalSamples({ cookieHeader: "session", query: { mine: "true" } })).statusCode).toBe(200);
  expect(service.list).toHaveBeenCalledWith("alice", true);
  expect((await controller.updateEvalSample({ cookieHeader: "session", sampleId: "s", body: { datasetStatus: "draft", actionRunId: "save", expectedUpdatedAt: "2026-09-21T00:00:00.000Z", evalBy: "bob" } })).statusCode).toBe(400);
});

it("rejects unauthenticated Eval reads and writes before accessing the dataset", async () => {
  const service = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
  const controller = createWebLarkTicketController({ evalDatasetService: service as never,
    resolveSession: vi.fn().mockResolvedValue({ ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "Missing session" }) });
  expect((await controller.listEvalSamples({ cookieHeader: undefined })).statusCode).toBe(401);
  expect((await controller.createEvalSample({ cookieHeader: undefined, recordId: "r", body: {} })).statusCode).toBe(401);
  expect((await controller.updateEvalSample({ cookieHeader: undefined, sampleId: "s", body: {} })).statusCode).toBe(401);
  for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
});

it("protects Shadow evaluation with page permission and server identity, including scoped reads", async () => {
  const service = { createShadow: vi.fn().mockResolvedValue({ id: "s" }), loadShadow: vi.fn().mockResolvedValue({ sample: null }), list: vi.fn().mockResolvedValue([]) };
  const session = vi.fn().mockResolvedValue({ ok: true, masterUserId: "alice", role: "dev", user: { larkName: "Alice" } });
  const controller = createWebLarkTicketController({ evalDatasetService: service as never, resolveSession: session });
  const body = { baseId: "b", tableId: "t", outputVersion: "a".repeat(64), actionRunId: "run", datasetStatus: "badcase", failureLabels: ["fact_incorrect"], notes: "环境错误" };
  expect((await controller.createShadowEvalSample({ cookieHeader: "session", recordId: "r", body })).statusCode).toBe(200);
  expect(service.createShadow).toHaveBeenCalledWith(expect.objectContaining({ ticket: { baseId: "b", tableId: "t", recordId: "r" }, reviewer: { id: "alice", name: "Alice" } }));
  expect((await controller.loadShadowEvalSample({ cookieHeader: "session", recordId: "r", query: { baseId: "b", tableId: "t", actionRunId: "read" } })).statusCode).toBe(200);
  expect((await controller.listEvalSamples({ cookieHeader: "session", query: { baseId: "b", tableId: "t", recordId: "r" } })).statusCode).toBe(200);
  expect(service.list).toHaveBeenCalledWith("alice", false, { baseId: "b", tableId: "t", recordId: "r" });
  expect((await controller.listEvalSamples({ cookieHeader: "session", query: { baseId: "b" } })).statusCode).toBe(400);
  expect((await controller.createShadowEvalSample({ cookieHeader: "session", recordId: "r", body: { ...body, reviewerId: "forged" } })).statusCode).toBe(400);
  session.mockResolvedValue({ ok: true, masterUserId: "bob", role: "viewer", user: {} });
  const denied = await controller.createShadowEvalSample({ cookieHeader: "session", recordId: "r", body });
  expect(denied.statusCode).toBe(403);
  expect(denied.body).toMatchObject({ error: { actionRunId: "run", layer: "server", module: "lark-ticket-eval-dataset", stage: "server.eval-dataset.auth" } });
  expect((await controller.loadShadowEvalSample({ cookieHeader: "session", recordId: "r", query: {} })).statusCode).toBe(403);
  expect((await controller.updateEvalSample({ cookieHeader: "session", sampleId: "s", body: {} })).statusCode).toBe(403);
  expect(service.createShadow).toHaveBeenCalledTimes(1);
});
