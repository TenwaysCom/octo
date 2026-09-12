import { describe, expect, it, vi } from "vitest";
import { createWebLarkTicketAiController } from "./lark-ticket-ai.controller.js";
import type { Request, Response } from "express";

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

  it.each(["lark-ticket-support-qa-summarize", "lark-ticket-wiki-qa"])("forwards one-shot events without creating a resumable session: %s", async (actionKey) => {
    const service = {
      listSessions: vi.fn().mockResolvedValue([]),
      chat: vi.fn(async (_input, emit) => {
        emit({ event: "acp.session.update", data: { sessionId: "deepseek-run_1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "问题总结" } } } });
        emit({ event: "done", data: { sessionId: "deepseek-run_1", stopReason: "end_turn" } });
      }),
    };
    const controller = createWebLarkTicketAiController({
      service: service as never,
      resolveSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "usr_1", baseUrl: "https://open.larksuite.com", user: {} }),
      resolveOperatorLarkId: vi.fn().mockResolvedValue("ou_1"),
    });
    const writes: string[] = [];
    let writableEnded = false;
    const req = {
      headers: { cookie: "octo_web_session=session_1" },
      body: { baseId: "app_1", tableId: "tbl_1", message: "生成结果", actionKey, actionRunId: "run_1" },
      params: { recordId: "rec_1" },
      once: vi.fn(),
      off: vi.fn(),
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => { writes.push(chunk); }),
      end: vi.fn(() => { writableEnded = true; }),
      once: vi.fn(),
      off: vi.fn(),
      get writableEnded() { return writableEnded; },
    } as unknown as Response;

    await controller.chat(req, res);

    expect(service.chat).toHaveBeenCalledWith(expect.objectContaining({ actionKey, actionRunId: "run_1" }), expect.any(Function));
    expect(writes.join("\n")).not.toContain("event: session.created");
    expect(writes.join("\n")).toContain("event: acp.session.update");
    expect(writes.join("\n")).toContain("event: done");
    const listed = await controller.list({ cookieHeader: "octo_web_session=session_1", recordId: "rec_1", query: { baseId: "app_1", tableId: "tbl_1" } });
    expect(listed.body).toMatchObject({ ok: true, data: { sessions: [expect.objectContaining({ oneShot: true, actionKey, runStatus: "completed" })] } });
  });

  it("confirms only a server-stored effect draft identity", async () => {
    const effectDraftService = { list: vi.fn(), confirm: vi.fn().mockResolvedValue({ draftId: "draft_1", status: "completed" }) };
    const controller = createWebLarkTicketAiController({
      service: {} as never,
      effectDraftService,
      resolveSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "usr_1", baseUrl: "https://open.larksuite.com", user: {} }),
      resolveOperatorLarkId: vi.fn().mockResolvedValue("ou_1"),
    });
    await expect(controller.confirmEffectDraft({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      draftId: "draft_1",
      body: { baseId: "app_1", tableId: "tbl_1", actionRunId: "run_1", confirmed: true },
    })).resolves.toMatchObject({ statusCode: 200 });
    expect(effectDraftService.confirm).toHaveBeenCalledWith({
      operatorLarkId: "ou_1",
      masterUserId: "usr_1",
      larkBaseUrl: "https://open.larksuite.com",
      ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
      draftId: "draft_1",
      actionRunId: "run_1",
      confirmed: true,
    });
  });

  it("rejects arbitrary business payloads on effect draft confirmation", async () => {
    const effectDraftService = { list: vi.fn(), confirm: vi.fn() };
    const controller = createWebLarkTicketAiController({
      service: {} as never,
      effectDraftService,
      resolveSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "usr_1", baseUrl: "https://open.larksuite.com", user: {} }),
      resolveOperatorLarkId: vi.fn().mockResolvedValue("ou_1"),
    });
    await expect(controller.confirmEffectDraft({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      draftId: "draft_1",
      body: { baseId: "app_1", tableId: "tbl_1", actionRunId: "run_1", confirmed: true, fields: { injected: true } },
    })).resolves.toMatchObject({ statusCode: 400, body: { error: { errorCode: "INVALID_REQUEST" } } });
    expect(effectDraftService.confirm).not.toHaveBeenCalled();
  });
});
