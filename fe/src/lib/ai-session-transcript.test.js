import assert from "node:assert/strict";
import test from "node:test";
import { aiSessionStatusAfterEvent, appendAiSessionEvent, createAiUserMessage } from "./ai-session-transcript.js";

function update(update) {
  return { event: "acp.session.update", data: { update } };
}

test("merges ACP text, thoughts, and tool state into one assistant entry", () => {
  let messages = [createAiUserMessage("请总结")];
  messages = appendAiSessionEvent(messages, update({
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "先读取" },
    messageId: "assistant-1",
  }));
  messages = appendAiSessionEvent(messages, update({
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "上下文" },
    messageId: "assistant-1",
  }));
  messages = appendAiSessionEvent(messages, update({
    sessionUpdate: "tool_call",
    toolCallId: "tool-1",
    title: "读取 Ticket",
    status: "in_progress",
  }));
  messages = appendAiSessionEvent(messages, update({
    sessionUpdate: "tool_call_update",
    toolCallId: "tool-1",
    status: "completed",
    locations: [{ path: "/tmp/ticket.md", line: 3 }],
  }));
  messages = appendAiSessionEvent(messages, update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "已完成" },
    messageId: "assistant-1",
  }));

  const assistant = messages.find((entry) => entry.kind === "assistant");
  assert.deepEqual(assistant, {
    id: assistant.id,
    kind: "assistant",
    text: "已完成",
    messageId: "assistant-1",
    thoughts: [{ id: assistant.thoughts[0].id, text: "先读取上下文", messageId: "assistant-1" }],
    toolCalls: [{ id: "tool-1", title: "读取 Ticket", status: "completed", detail: "/tmp/ticket.md:3" }],
  });
});

test("starts a new assistant entry after a new user turn when ACP omits message IDs", () => {
  let messages = [createAiUserMessage("第一轮")];
  messages = appendAiSessionEvent(messages, update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "第一轮回复" },
  }));
  messages = [...messages, createAiUserMessage("第二轮")];
  messages = appendAiSessionEvent(messages, update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "第二轮回复" },
  }));

  assert.deepEqual(
    messages.filter((entry) => entry.kind === "assistant").map((entry) => entry.text),
    ["第一轮回复", "第二轮回复"],
  );
});

test("shows one permission entry through resolution and never completes a waiting or failed turn", () => {
  const data = { requestId: "request", sessionId: "session", actionRunId: "run", expiresAt: "2026-09-06T00:00:00Z", toolCall: { title: "Risk" }, options: [] };
  let messages = [createAiUserMessage("run")];
  messages = appendAiSessionEvent(messages, { event: "acp.permission.requested", data });
  assert.equal(messages.at(-1).permission.status, "pending");
  assert.equal(appendAiSessionEvent(messages, { event: "done" }).length, messages.length);
  messages = appendAiSessionEvent(messages, { event: "acp.permission.resolved", data: { ...data, status: "rejected" } });
  assert.equal(messages.length, 2);
  assert.equal(appendAiSessionEvent(messages, { event: "done" }).length, 2);
  messages = [...messages, createAiUserMessage("retry")];
  assert.equal(appendAiSessionEvent(messages, { event: "done" }).at(-1).text, "本轮 AI 回复已完成");
});

test("keeps waiting and permission failures out of the ready state", async () => {
  // Test the same state transition used by both Ticket and Sprint drawers.
  assert.equal(aiSessionStatusAfterEvent("generating", { event: "acp.permission.requested" }), "waiting_permission");
  assert.equal(aiSessionStatusAfterEvent("waiting_permission", { event: "done" }), "waiting_permission");
  assert.equal(aiSessionStatusAfterEvent("waiting_permission", { event: "acp.permission.resolved", data: { status: "expired" } }), "error");
  assert.equal(aiSessionStatusAfterEvent("error", { event: "done" }), "error");
});
