import test from "node:test";
import assert from "node:assert/strict";
import { createAiSessionPanel, drawerFromAiSessionSnapshot } from "./ai-session-panel.js";

function deferred() { let resolve; let reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
const chunk = (text) => ({ event: "acp.session.update", data: { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });
const started = { event: "run.started", data: { runId: "r1", sessionId: "s1" } };
const done = { event: "done", data: { sessionId: "s1", stopReason: "end_turn" } };
const snapshot = (extra = {}) => ({ sessionId: "s1", runId: "r1", runStatus: "running", title: "分析", events: [chunk("已有内容")], ...extra });
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("closing detaches the accepted stream without stopping the run or letting late events reopen it", async () => {
  const gate = deferred(); let observer; let signal; let stops = 0;
  const panel = createAiSessionPanel({ load: async () => snapshot(), stop: async () => { stops++; }, stream: async (input) => { observer = input.onEvent; signal = input.signal; observer(started); await gate.promise; } });
  const execution = panel.start({ message: "分析" });
  panel.close();
  observer(chunk("late")); observer(done);
  assert.equal(signal.aborted, true);
  assert.equal(panel.getSnapshot(), null);
  assert.equal(stops, 0);
  gate.resolve(); await execution;
  assert.equal(panel.getSnapshot(), null);
  panel.dispose();
});

test("closing during startup waits for server acceptance before detaching the request", async () => {
  const gate = deferred(); let observer; let signal;
  const panel = createAiSessionPanel({ load: async () => snapshot(), stop: async () => { assert.fail("Close must never call stop"); }, stream: async (input) => { observer = input.onEvent; signal = input.signal; await gate.promise; } });
  const execution = panel.start({ message: "分析" });
  panel.close();
  assert.equal(signal.aborted, false);
  observer(started);
  assert.equal(signal.aborted, true);
  assert.equal(panel.getSnapshot(), null);
  gate.resolve(); await execution;
  panel.dispose();
});

test("reopening or refreshing loads running history and polls to completion without resubmitting", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let loads = 0; let submissions = 0;
  const panel = createAiSessionPanel({ load: async () => snapshot(++loads > 1 ? { runStatus: "completed", events: [chunk("完整回答"), done] } : {}), stream: async () => { submissions++; }, stop: async () => {}, pollMs: 100 });
  t.after(() => panel.dispose());
  await panel.open({ sessionId: "s1", title: "分析" });
  assert.equal(panel.getSnapshot().status, "generating");
  assert.equal(panel.getSnapshot().messages[0].text, "已有内容");
  t.mock.timers.tick(100); await flush();
  assert.equal(panel.getSnapshot().status, "ready");
  assert.equal(panel.getSnapshot().messages[0].text, "完整回答");
  assert.equal(submissions, 0);
  t.mock.timers.tick(1000); await flush();
  assert.equal(loads, 2);
});

test("a delayed load cannot reopen a closed panel or overwrite a different session", async () => {
  const gate = deferred();
  const panel = createAiSessionPanel({ load: (id) => id === "s1" ? gate.promise : Promise.resolve(snapshot({ sessionId: "s2", runStatus: "completed" })), stream: async () => {}, stop: async () => {} });
  const first = panel.open({ sessionId: "s1" });
  panel.close();
  await panel.open({ sessionId: "s2" });
  gate.resolve(snapshot()); await first;
  assert.equal(panel.getSnapshot().sessionId, "s2");
  panel.dispose();
});

test("an older stream cannot append to a newly opened session", async () => {
  const gate = deferred(); let emit;
  const panel = createAiSessionPanel({ load: async () => snapshot({ sessionId: "s2", runStatus: "completed", events: [chunk("会话二")] }), stream: async (input) => { emit = input.onEvent; emit(started); await gate.promise; }, stop: async () => {} });
  const execution = panel.start({ message: "会话一" });
  await panel.open({ sessionId: "s2" });
  emit(chunk("会话一晚到的消息")); emit(done); gate.resolve(); await execution;
  assert.deepEqual(panel.getSnapshot().messages.map((item) => item.text), ["会话二"]);
  panel.dispose();
});

test("a new session does not inherit the previous session's messages or action", async () => {
  const panel = createAiSessionPanel({ load: async () => snapshot({ runStatus: "completed", actionKey: "old-action" }), stream: async ({ onEvent }) => { onEvent(done); }, stop: async () => {} });
  await panel.open({ sessionId: "s1" });
  await panel.start({ message: "新的问题" });
  assert.equal(panel.getSnapshot().actionKey, undefined);
  assert.equal(panel.getSnapshot().sessionId, null);
  assert.deepEqual(panel.getSnapshot().messages.filter((item) => item.kind !== "status").map((item) => item.text), ["新的问题"]);
  panel.dispose();
});

test("a dropped stream reloads server status instead of marking the running task failed", async () => {
  const panel = createAiSessionPanel({ load: async () => snapshot(), stream: async ({ onEvent }) => { onEvent(started); throw new Error("network lost"); }, stop: async () => {} });
  await panel.start({ message: "分析" });
  assert.equal(panel.getSnapshot().status, "generating");
  assert.equal(panel.getSnapshot().error, "");
  panel.dispose();
});

test("pending permission history is stable across snapshots and resolves from server state", () => {
  const permission = { event: "acp.permission.requested", data: { requestId: "permission1", sessionId: "s1", options: [], toolCall: {}, expiresAt: "2026-09-06T23:00:00Z" } };
  const pending = snapshot({ runStatus: "waiting_permission", events: [permission] });
  const first = drawerFromAiSessionSnapshot({}, pending);
  const second = drawerFromAiSessionSnapshot(first, pending);
  assert.equal(first.status, "waiting_permission");
  assert.equal(first.messages[0].permission.status, "pending");
  assert.equal(first.messages[0].id, second.messages[0].id);
  const resolved = drawerFromAiSessionSnapshot(second, snapshot({ runStatus: "failed", errorMessage: "审批已过期", events: [permission, { event: "acp.permission.resolved", data: { ...permission.data, status: "expired" } }] }));
  assert.equal(resolved.status, "error");
  assert.equal(resolved.messages[0].permission.status, "expired");
  assert.equal(resolved.error, "审批已过期");
});

test("live permission replies resume only on approval and never verify a rejected or waiting turn", async (t) => {
  for (const resolution of ["approved", "rejected", "expired", null]) {
    const gate = deferred(); let emit;
    const panel = createAiSessionPanel({ load: async () => snapshot(), stop: async () => {}, stream: async ({ onEvent }) => { emit = onEvent; emit(started); await gate.promise; } });
    t.after(() => panel.dispose());
    const execution = panel.start({ message: "执行操作", actionKey: "document" });
    const data = { requestId: "permission1", sessionId: "s1", actionRunId: "a1", options: [], toolCall: {}, expiresAt: new Date(Date.now() + 50000).toISOString() };
    emit({ event: "acp.permission.requested", data });
    assert.equal(panel.getSnapshot().status, "waiting_permission");
    assert.equal(panel.getSnapshot().runStatus, "waiting_permission");
    if (resolution) {
      emit({ event: "acp.permission.resolved", data: { ...data, status: resolution } });
      assert.equal(panel.getSnapshot().status, resolution === "approved" ? "generating" : "error");
      assert.equal(panel.getSnapshot().runStatus, resolution === "approved" ? "running" : "failed");
    }
    emit(done);
    assert.equal(panel.getSnapshot().runStatus, resolution === "approved" ? "completed" : resolution ? "failed" : "waiting_permission");
    assert.equal(panel.getSnapshot().verificationStatus, resolution === "approved" ? "verified" : resolution ? "unverified" : "pending");
    gate.resolve(); await execution;
  }
});

test("restored steps and turns have unique stable keys despite reused ACP message IDs", () => {
  const withId = (text) => { const event = chunk(text); event.data.update.messageId = "reused"; return event; };
  const events = [
    withId("第一步"),
    { event: "acp.session.update", data: { update: { sessionUpdate: "tool_call", toolCallId: "read" } } },
    withId("第二步"), done,
    { event: "acp.session.update", data: { update: { sessionUpdate: "user_message_chunk", content: { text: "再问" } } } },
    withId("下一轮"),
  ];
  const first = drawerFromAiSessionSnapshot({}, snapshot({ events }));
  const second = drawerFromAiSessionSnapshot(first, snapshot({ events: [...events, withId("继续")] }));
  const ids = first.messages.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(second.messages.map((entry) => entry.id), ids);
  assert.deepEqual(second.messages.filter((entry) => entry.kind === "assistant").map((entry) => entry.text), ["第一步", "第二步", "下一轮继续"]);
});

test("stop targets the exact run and late stream chunks do not duplicate the stop snapshot", async () => {
  const gate = deferred(); let emit; let stopped;
  const panel = createAiSessionPanel({ load: async () => snapshot({ runStatus: "cancelled" }), stream: async ({ onEvent }) => { emit = onEvent; emit(started); await gate.promise; }, stop: async (...args) => { stopped = args; return snapshot({ runStatus: "cancelled" }); } });
  const execution = panel.start({ message: "分析" });
  await panel.stop();
  assert.deepEqual(stopped, ["s1", "r1"]);
  emit(chunk("已有内容")); gate.resolve(); await execution;
  assert.equal(panel.getSnapshot().status, "cancelled");
  assert.deepEqual(panel.getSnapshot().messages.map((item) => item.text), ["已有内容"]);
  panel.dispose();
});

test("StrictMode effect cleanup can be followed by reactivation", async () => {
  const panel = createAiSessionPanel({ load: async () => snapshot({ runStatus: "completed" }), stream: async () => {}, stop: async () => {} });
  panel.dispose(); panel.activate();
  await panel.open({ sessionId: "s1" });
  assert.equal(panel.getSnapshot().status, "ready");
  panel.dispose();
});

test("completion of a detached stream cannot cancel the reopened panel's polling", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const gate = deferred(); let completed = false;
  const panel = createAiSessionPanel({ load: async () => snapshot({ runStatus: completed ? "completed" : "running" }), stream: async ({ onEvent }) => { onEvent(started); await gate.promise; }, stop: async () => {}, pollMs: 100 });
  t.after(() => panel.dispose());
  const execution = panel.start({ message: "分析" });
  panel.close(); await panel.open({ sessionId: "s1" });
  completed = true; gate.resolve(); await execution;
  t.mock.timers.tick(100); await flush();
  assert.equal(panel.getSnapshot().status, "ready");
});
