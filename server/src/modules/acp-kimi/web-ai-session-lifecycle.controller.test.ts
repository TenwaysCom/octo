import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { createWebLarkTicketAiController } from "../lark-ticket-ai/lark-ticket-ai.controller.js";
import { createWebMeegleSprintAiController } from "../meegle-sprint-ai/meegle-sprint-ai.controller.js";
import type { AcpKimiStreamEvent } from "./event-stream.js";

function deferred() { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; }
function fixture(kind: "ticket" | "sprint", chat: (input: { signal: AbortSignal }, emit: (event: AcpKimiStreamEvent) => void) => Promise<void>) {
  const service = { chat: vi.fn(chat), listSessions: vi.fn().mockResolvedValue([]), loadSession: vi.fn().mockRejectedValue(new Error("Native history must not load a running session")) };
  const resolveOperatorLarkId = vi.fn().mockResolvedValue("ou_1");
  const deps = { service: service as never, resolveOperatorLarkId, resolveSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "u1", role: "pm", baseUrl: "https://example.com", user: {} }) };
  const controller = kind === "ticket" ? createWebLarkTicketAiController(deps) : createWebMeegleSprintAiController(deps);
  const ref = kind === "ticket" ? { baseId: "b1", tableId: "t1" } : { projectKey: "p1" };
  const params = { recordId: "record1", sprintId: "sprint1" };
  const req = Object.assign(new EventEmitter(), { headers: { cookie: "octo_web_session=test" }, body: { ...ref, message: "分析", actionRunId: "action_1" }, params }) as unknown as Request;
  const res = Object.assign(new EventEmitter(), {
    status: vi.fn().mockReturnThis(), setHeader: vi.fn(), flushHeaders: vi.fn(), write: vi.fn(), end: vi.fn(), writableEnded: false, destroyed: false,
  }) as unknown as Response;
  return { controller, service, resolveOperatorLarkId, req, res,
    load: (sessionId = "s1") => controller.load({ cookieHeader: "octo_web_session=test", ...params, sessionId, body: ref }),
    list: () => controller.list({ cookieHeader: "octo_web_session=test", ...params, query: ref }),
    stop: (runId: string, body = {}) => controller.stop({ cookieHeader: "octo_web_session=test", ...params, sessionId: "s1", body: { ...ref, runId, ...body } }),
  };
}

for (const kind of ["ticket", "sprint"] as const) describe(`${kind} Web AI lifecycle`, () => {
  it("continues after browser disconnect and serves growing history without touching a busy runtime", async () => {
    const entered = deferred(); const gate = deferred(); let signal!: AbortSignal;
    const f = fixture(kind, async (input, emit) => {
      signal = input.signal;
      emit({ event: "session.created", data: { sessionId: "s1" } }); entered.resolve();
      await gate.promise;
      emit({ event: "acp.session.update", data: { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "后台生成完成" } } } });
      emit({ event: "done", data: { sessionId: "s1", stopReason: "end_turn" } });
    });
    const execution = f.controller.chat(f.req, f.res);
    await entered.promise;
    f.res.emit("close"); f.req.emit("aborted");
    const writesBefore = (f.res.write as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(signal.aborted).toBe(false);
    expect(await f.load()).toMatchObject({ statusCode: 200, body: { data: { sessionId: "s1", runStatus: "running" } } });
    expect(await f.list()).toMatchObject({ body: { data: { sessions: [expect.objectContaining({ sessionId: "s1", runStatus: "running" })] } } });
    gate.resolve(); await execution;
    expect(signal.aborted).toBe(false);
    expect(f.res.write).toHaveBeenCalledTimes(writesBefore);
    expect(await f.load()).toMatchObject({ body: { data: { runStatus: "completed", events: expect.arrayContaining([expect.objectContaining({ event: "done" })]) } } });
    expect(f.service.loadSession).not.toHaveBeenCalled();
    expect(f.service.chat).toHaveBeenCalledTimes(1);
  });

  it("authenticates and validates explicit stop without letting another user stop the run", async () => {
    const entered = deferred(); let signal!: AbortSignal;
    const f = fixture(kind, async (input, emit) => {
      signal = input.signal; emit({ event: "session.created", data: { sessionId: "s1" } }); entered.resolve();
      await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    });
    const execution = f.controller.chat(f.req, f.res); await entered.promise;
    const loaded = await f.load();
    const runId = (loaded.body as { data: { runId: string } }).data.runId;
    f.resolveOperatorLarkId.mockResolvedValue("ou_2");
    expect(await f.stop(runId)).toMatchObject({ statusCode: 404 });
    expect(signal.aborted).toBe(false);
    f.resolveOperatorLarkId.mockResolvedValue("ou_1");
    expect(await f.stop(runId, { operatorLarkId: "ou_2" })).toMatchObject({ statusCode: 400 });
    expect(signal.aborted).toBe(false);
    expect(await f.stop("old_run")).toMatchObject({ statusCode: 404 });
    expect(await f.stop(runId)).toMatchObject({ statusCode: 200 });
    await execution;
    expect(signal.aborted).toBe(true);
    expect(await f.load()).toMatchObject({ body: { data: { runStatus: "cancelled", errorCode: "AI_RUN_CANCELLED" } } });
  });

  it("a response write error detaches the observer without failing the run", async () => {
    const f = fixture(kind, async (_input, emit) => {
      emit({ event: "session.created", data: { sessionId: "s1" } });
      emit({ event: "done", data: { sessionId: "s1", stopReason: "end_turn" } });
    });
    (f.res.write as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error("socket closed"); });
    await f.controller.chat(f.req, f.res);
    expect(await f.load()).toMatchObject({ body: { data: { runStatus: "completed" } } });
  });
});
