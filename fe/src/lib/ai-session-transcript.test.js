import assert from "node:assert/strict";
import test from "node:test";
import { aiSessionStatusAfterEvent, appendAiSessionEvent, createAiUserMessage, transcriptFromAiSessionEvents } from "./ai-session-transcript.js";

function update(update) {
  return { event: "acp.session.update", data: { update } };
}

test("merges thought chunks and tool state, then starts a response after tools", () => {
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
    text: "",
    messageId: "assistant-1",
    thoughts: [{ id: assistant.thoughts[0].id, text: "先读取上下文", messageId: "assistant-1" }],
    toolCalls: [{ id: "tool-1", title: "读取 Ticket", status: "completed", detail: "/tmp/ticket.md:3" }],
  });
  assert.deepEqual(messages.filter((entry) => entry.kind === "assistant").map((entry) => entry.text), ["", "已完成"]);
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

test("never merges reused ACP message IDs across user turns or completion", () => {
  const reply = (text) => update({ sessionUpdate: "agent_message_chunk", messageId: "reused", content: { text } });
  for (const boundary of [
    update({ sessionUpdate: "user_message_chunk", content: { text: "再问一次" } }),
    { event: "done", data: { stopReason: "end_turn" } },
  ]) {
    const messages = transcriptFromAiSessionEvents([reply("第一轮"), boundary, reply("第二轮")]);
    assert.deepEqual(messages.filter((entry) => entry.kind === "assistant").map((entry) => entry.text), ["第一轮", "第二轮"]);
  }
});

test("keeps consecutive chunks together and separates repeated thinking/tool steps with absent or reused IDs", () => {
  for (const messageId of [undefined, "reused"]) {
    const chunk = (sessionUpdate, text) => update({ sessionUpdate, messageId, content: { text } });
    const messages = transcriptFromAiSessionEvents([
      chunk("user_message_chunk", "分析"),
      chunk("agent_thought_chunk", "先读"), chunk("agent_thought_chunk", "材料"),
      chunk("agent_message_chunk", "开始"), chunk("agent_message_chunk", "读取"),
      update({ sessionUpdate: "tool_call", toolCallId: "read", title: "读取", status: "in_progress" }),
      update({ sessionUpdate: "tool_call", toolCallId: "search", title: "搜索", status: "in_progress" }),
      update({ sessionUpdate: "tool_call_update", toolCallId: "read", status: "completed" }),
      chunk("agent_thought_chunk", "继续"), chunk("agent_thought_chunk", "核对"),
      // A late update belongs to the earlier step, even after new thinking.
      update({ sessionUpdate: "tool_call_update", toolCallId: "search", status: "completed" }),
      update({ sessionUpdate: "tool_call", toolCallId: "verify", title: "核对", status: "completed" }),
      chunk("agent_message_chunk", "最终"), chunk("agent_message_chunk", "回复"),
    ]);
    const assistants = messages.filter((entry) => entry.kind === "assistant");
    assert.deepEqual(assistants.map((entry) => ({
      text: entry.text, thoughts: entry.thoughts.map((thought) => thought.text),
      tools: entry.toolCalls.map((tool) => [tool.id, tool.status]),
    })), [
      { text: "开始读取", thoughts: ["先读材料"], tools: [["read", "completed"], ["search", "completed"]] },
      { text: "", thoughts: ["继续核对"], tools: [["verify", "completed"]] },
      { text: "最终回复", thoughts: [], tools: [] },
    ]);
  }
});

test("new thinking after assistant text starts another step even without tools", () => {
  const messages = transcriptFromAiSessionEvents([
    update({ sessionUpdate: "agent_message_chunk", content: { text: "进度" } }),
    update({ sessionUpdate: "agent_thought_chunk", content: { text: "再检查" } }),
    update({ sessionUpdate: "agent_message_chunk", content: { text: "结果" } }),
  ]);
  assert.deepEqual(messages.map((entry) => [entry.text, entry.thoughts.map((thought) => thought.text)]), [["进度", []], ["结果", ["再检查"]]]);
});

test("honors changed explicit message IDs after a step begins without an ID", () => {
  const messages = transcriptFromAiSessionEvents([
    update({ sessionUpdate: "agent_thought_chunk", content: { text: "先想" } }),
    update({ sessionUpdate: "agent_message_chunk", messageId: "first", content: { text: "第一段" } }),
    update({ sessionUpdate: "agent_message_chunk", content: { text: "继续" } }),
    update({ sessionUpdate: "agent_message_chunk", messageId: "second", content: { text: "第二段" } }),
  ]);
  assert.deepEqual(messages.map((entry) => [entry.messageId, entry.text]), [["first", "第一段继续"], ["second", "第二段"]]);
});

test("plans and permission resolution do not duplicate tools or split consecutive thinking", () => {
  const permission = { requestId: "p1", toolCall: {}, options: [] };
  const messages = transcriptFromAiSessionEvents([
    update({ sessionUpdate: "agent_thought_chunk", content: { text: "计划" } }),
    update({ sessionUpdate: "plan", entries: [] }),
    update({ sessionUpdate: "agent_thought_chunk", content: { text: "继续" } }),
    update({ sessionUpdate: "tool_call", toolCallId: "read", status: "pending" }),
    { event: "acp.permission.requested", data: permission },
    { event: "acp.permission.resolved", data: { ...permission, status: "approved" } },
    update({ sessionUpdate: "tool_call_update", toolCallId: "read", status: "completed" }),
    update({ sessionUpdate: "agent_message_chunk", content: { text: "完成" } }),
  ]);
  const assistants = messages.filter((entry) => entry.kind === "assistant");
  assert.equal(assistants.length, 2);
  assert.equal(assistants[0].thoughts[0].text, "计划继续");
  assert.equal(assistants[0].toolCalls.length, 1);
  assert.equal(assistants[0].toolCalls[0].status, "completed");
  assert.equal(assistants[1].text, "完成");
  assert.equal(messages.filter((entry) => entry.kind === "permission").length, 1);
});

test("tool IDs reused in another user turn do not modify earlier calls", () => {
  const messages = transcriptFromAiSessionEvents([
    update({ sessionUpdate: "tool_call", toolCallId: "reused", title: "第一轮工具", status: "completed" }),
    update({ sessionUpdate: "user_message_chunk", content: { text: "第二轮" } }),
    update({ sessionUpdate: "tool_call", toolCallId: "reused", title: "第二轮工具", status: "failed" }),
  ]);
  assert.deepEqual(messages.filter((entry) => entry.kind === "assistant").map((entry) => entry.toolCalls.map((tool) => [tool.title, tool.status])), [
    [["第一轮工具", "completed"]], [["第二轮工具", "failed"]],
  ]);
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
