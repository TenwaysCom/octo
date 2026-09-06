import { createWebAiSessionRuns, mergeWebAiSessions } from "./web-ai-session-runs.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";

const scope = { operatorLarkId: "ou_1", resource: '["ticket","base","table","record"]' };
const input = { ...scope, message: "帮我分析", actionRunId: "action_1" };
const chunk = (text: string): AcpKimiStreamEvent => ({ event: "acp.session.update", data: { sessionId: "session_1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });
const done: AcpKimiStreamEvent = { event: "done", data: { sessionId: "session_1", stopReason: "end_turn" } };
function deferred() { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; }

describe("Web AI session runs", () => {
  it("exposes active history before completion and retains it for reopening", async () => {
    const runs = createWebAiSessionRuns();
    const gate = deferred();
    const emit = vi.fn();
    const execution = runs.execute(input, { loadHistory: vi.fn(), emit, chat: async (_signal, send) => {
      send({ event: "session.created", data: { sessionId: "session_1" } });
      send(chunk("第一部分"));
      await gate.promise;
      send(chunk("第二部分")); send(done);
    } });
    const active = runs.load(scope, "session_1")!;
    expect(active.runStatus).toBe("running");
    expect(active.events).toContainEqual(chunk("第一部分"));
    expect(active.events[0]).toMatchObject({ data: { update: { sessionUpdate: "user_message_chunk", content: { text: "帮我分析" } } } });
    expect(runs.load(scope, active.runId)?.sessionId).toBe("session_1");
    expect(mergeWebAiSessions([{ sessionId: "session_1", title: "old" }], runs.list(scope))).toHaveLength(1);
    gate.resolve(); await execution;
    expect(runs.load(scope, "session_1")).toMatchObject({ runStatus: "completed", events: expect.arrayContaining([chunk("第二部分"), done]) });
  });

  it("preserves all previous turns and rejects concurrent followups before loading history", async () => {
    const runs = createWebAiSessionRuns(); const gate = deferred(); const historyGate = deferred();
    const loadHistory = vi.fn(async () => { await historyGate.promise; return { events: [chunk("上轮回答"), done] }; });
    const execution = runs.execute({ ...input, sessionId: "session_1" }, { loadHistory, emit: vi.fn(), chat: async (_signal, emit) => { await gate.promise; emit(chunk("追问回答")); emit(done); } });
    await expect(runs.execute({ ...input, sessionId: "session_1" }, { loadHistory, emit: vi.fn(), chat: vi.fn() })).rejects.toMatchObject({ code: "SESSION_BUSY" });
    expect(loadHistory).toHaveBeenCalledTimes(1);
    historyGate.resolve(); gate.resolve(); await execution;
    expect(runs.load(scope, "session_1")!.events).toEqual(expect.arrayContaining([chunk("上轮回答"), chunk("追问回答")]));
    const noHistory = vi.fn();
    await runs.execute({ ...input, sessionId: "session_1" }, { loadHistory: noHistory, emit: vi.fn(), chat: async (_signal, emit) => { emit(chunk("下一轮")); emit(done); } });
    expect(noHistory).not.toHaveBeenCalled();
  });

  it("does not treat a previous turn's done as completion of an interrupted turn", async () => {
    const runs = createWebAiSessionRuns();
    await expect(runs.execute({ ...input, sessionId: "session_1" }, { loadHistory: async () => ({ events: [done] }), emit: vi.fn(), chat: async () => {} })).rejects.toMatchObject({ code: "AI_RUN_INCOMPLETE" });
    expect(runs.load(scope, "session_1")?.runStatus).toBe("failed");
  });

  it("waits for business postprocessing before publishing done", async () => {
    const runs = createWebAiSessionRuns(); const gate = deferred(); const emit = vi.fn();
    const execution = runs.execute(input, { loadHistory: vi.fn(), emit, chat: async (_signal, send) => { send(done); await gate.promise; throw new Error("writeback failed"); } });
    expect(emit).not.toHaveBeenCalledWith(done);
    gate.resolve(); await expect(execution).rejects.toThrow("writeback failed");
    expect(runs.list(scope)[0].runStatus).toBe("failed");
    expect(runs.load(scope, runs.list(scope)[0].runId)?.events).not.toContainEqual(done);
    expect(emit).not.toHaveBeenCalledWith(done);
  });

  it("keeps pending permissions visible on reopen and records their resolution", async () => {
    const runs = createWebAiSessionRuns(); const gate = deferred();
    const data = { sessionId: "session_1", requestId: "permission_1", actionRunId: "action_1", expiresAt: new Date(Date.now() + 50_000).toISOString(), options: [], toolCall: { toolCallId: "tool_1", title: "Command" } };
    const execution = runs.execute(input, { loadHistory: vi.fn(), emit: vi.fn(), chat: async (_signal, emit) => {
      emit({ event: "session.created", data: { sessionId: "session_1" } });
      emit({ event: "acp.permission.requested", data });
      await gate.promise;
      emit({ event: "acp.permission.resolved", data: { ...data, status: "approved" } }); emit(done);
    } });
    expect(runs.load(scope, "session_1")).toMatchObject({ runStatus: "waiting_permission", events: expect.arrayContaining([{ event: "acp.permission.requested", data }]) });
    gate.resolve(); await execution;
    expect(runs.load(scope, "session_1")?.events).toContainEqual({ event: "acp.permission.resolved", data: { ...data, status: "approved" } });
  });

  it("only stops the selected owner's exact run and preserves partial output", async () => {
    const runs = createWebAiSessionRuns();
    const chat = async (signal: AbortSignal, emit: (event: AcpKimiStreamEvent) => void) => {
      emit({ event: "session.created", data: { sessionId: "session_1" } }); emit(chunk("部分内容"));
      await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    };
    const execution = runs.execute(input, { loadHistory: vi.fn(), emit: vi.fn(), chat });
    const run = runs.load(scope, "session_1")!;
    for (const outsider of [{ ...scope, operatorLarkId: "ou_2" }, { ...scope, resource: "another-ticket" }]) {
      expect(runs.load(outsider, "session_1")).toBeUndefined();
      expect(() => runs.stop(outsider, "session_1", run.runId)).toThrow();
      expect(runs.list(outsider)).toEqual([]);
    }
    expect(() => runs.stop(scope, "session_1", "stale_run")).toThrow();
    expect(runs.stop(scope, "session_1", run.runId).runStatus).toBe("stopping");
    await expect(execution).rejects.toMatchObject({ code: "AI_RUN_CANCELLED" });
    expect(runs.load(scope, "session_1")).toMatchObject({ runStatus: "cancelled", events: expect.arrayContaining([chunk("部分内容")]) });
    const next = runs.execute({ ...input, sessionId: "session_1" }, { loadHistory: vi.fn(), emit: vi.fn(), chat });
    expect(() => runs.stop(scope, "session_1", run.runId)).toThrow();
    runs.stop(scope, "session_1", runs.load(scope, "session_1")!.runId);
    await expect(next).rejects.toMatchObject({ code: "AI_RUN_CANCELLED" });
  });

  it("bounds unattended runs and expires only completed snapshots", async () => {
    vi.useFakeTimers();
    try {
      const runs = createWebAiSessionRuns({ timeoutMs: 100, retentionMs: 50 });
      const execution = runs.execute(input, { loadHistory: vi.fn(), emit: vi.fn(), chat: async (signal) => {
        await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      } });
      const rejection = expect(execution).rejects.toMatchObject({ code: "AI_RUN_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(60);
      expect(runs.list(scope)).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(40); await rejection;
      expect(runs.list(scope)[0].runStatus).toBe("failed");
      await vi.advanceTimersByTimeAsync(51);
      expect(runs.list(scope)).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });

  it("exposes one-shot runs without making them resumable agent sessions", async () => {
    const runs = createWebAiSessionRuns();
    await runs.execute({ ...input, oneShot: true }, { loadHistory: vi.fn(), emit: vi.fn(), chat: async (_signal, emit) => { emit(chunk("总结")); emit(done); } });
    const run = runs.list(scope)[0];
    expect(run).toMatchObject({ oneShot: true, runStatus: "completed" });
    expect(run.sessionId).toMatch(/^web_run_/);
    await expect(runs.execute({ ...input, sessionId: run.sessionId }, { loadHistory: vi.fn(), emit: vi.fn(), chat: vi.fn() })).rejects.toMatchObject({ code: "AI_RUN_NOT_RESUMABLE" });
  });

  it("preserves saved session title and action metadata on a cold followup", async () => {
    const runs = createWebAiSessionRuns();
    await runs.execute({ ...input, sessionId: "session_1" }, { loadHistory: async () => ({ events: [] }), emit: vi.fn(), chat: async (_signal, emit) => { emit(done); } });
    const merged = mergeWebAiSessions([{ sessionId: "session_1", title: "原会话标题", actionKey: "original-action" }], runs.list(scope));
    expect(merged[0]).toMatchObject({ title: "原会话标题", actionKey: "original-action", runStatus: "completed" });
  });
});
