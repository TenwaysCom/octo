import assert from "node:assert/strict";
import test from "node:test";
import { getLarkTicketAiPipeline } from "./lark-ticket-ai-pipeline.js";

test("maps Ticket AI fields into the four-stage output pipeline without treating missing sessions as complete", () => {
  const pipeline = getLarkTicketAiPipeline({ ticketAi: { fields: { "AI分析状态": "已分析", "AI Bug 分类": "登录问题", "AI Ticket 总结": "用户无法登录", "AI建议产物": "FAQ" } } });
  assert.deepEqual(pipeline.map(({ id, status, summary }) => ({ id, status, summary })), [
    { id: "intent", status: "已分析", summary: "登录问题" },
    { id: "summary", status: "已分析", summary: "用户无法登录" },
    { id: "answer", status: "未生成", summary: "暂无输出" },
    { id: "document", status: "已生成", summary: "FAQ" },
  ]);
});
