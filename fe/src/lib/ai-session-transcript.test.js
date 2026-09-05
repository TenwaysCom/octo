import assert from "node:assert/strict";
import test from "node:test";
import { appendAiSessionEvent, createAiUserMessage } from "./ai-session-transcript.js";

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
