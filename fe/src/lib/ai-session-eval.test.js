import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAiSessionForEval } from "./ai-session-eval.js";

test("summarizes the same assistant and tool state displayed by the Ticket AI UI", () => {
  const result = summarizeAiSessionForEval([
    {
      event: "acp.session.update",
      data: { update: { sessionUpdate: "agent_message_chunk", messageId: "msg_1", content: { type: "text", text: "已确认信息" } } },
    },
    {
      event: "acp.session.update",
      data: { update: { sessionUpdate: "tool_call", toolCallId: "tool_1", title: "Bash", status: "running", locations: [{ path: "docs/support-qa/card.md", line: 3 }] } },
    },
    {
      event: "acp.session.update",
      data: { update: { sessionUpdate: "tool_call_update", toolCallId: "tool_1", status: "completed" } },
    },
    { event: "done", data: { stopReason: "end_turn" } },
  ]);

  assert.deepEqual(result, {
    output: "已确认信息",
    toolCalls: [{ title: "Bash", status: "completed", detail: "docs/support-qa/card.md:3" }],
    stopReason: "end_turn",
    eventCount: 4,
  });
});
