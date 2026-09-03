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

test("falls back to shadow analysis for intent and summary when no production AI output exists", () => {
  const pipeline = getLarkTicketAiPipeline({
    ticketAi: { fields: {} },
    shadowAi: { status: "ok", intent: "troubleshoot / workflow_stuck", intentConfidence: 0.72, summary: "订单无法添加促销，待排查。" },
  });
  assert.deepEqual(pipeline.map(({ id, status, summary, shadow }) => ({ id, status, summary, shadow: Boolean(shadow) })), [
    { id: "intent", status: "影子·已生成", summary: "troubleshoot / workflow_stuck", shadow: true },
    { id: "summary", status: "影子·已生成", summary: "订单无法添加促销，待排查。", shadow: true },
    { id: "answer", status: "未生成", summary: "暂无输出", shadow: false },
    { id: "document", status: "未生成", summary: "暂无输出", shadow: false },
  ]);
});

test("production AI fields win over shadow analysis", () => {
  const pipeline = getLarkTicketAiPipeline({
    ticketAi: { fields: { "AI意图": "bug_report / data_consistency", "AI意图识别状态": "已分析", "AI Ticket 总结": "正式总结", "AI问题总结状态": "已生成" } },
    shadowAi: { status: "ok", intent: "troubleshoot / workflow_stuck", summary: "影子总结" },
  });
  const [intent, summary] = pipeline;
  assert.equal(intent.summary, "bug_report / data_consistency");
  assert.equal(intent.status, "已分析");
  assert.equal(intent.shadow, undefined);
  assert.equal(summary.summary, "正式总结");
  assert.equal(summary.shadow, undefined);
});

test("non-ok shadow results are not merged", () => {
  const pipeline = getLarkTicketAiPipeline({
    ticketAi: { fields: {} },
    shadowAi: { status: "error", errorCode: "SHADOW_ACP_FAILED" },
  });
  assert.deepEqual(pipeline.map(({ id, status }) => ({ id, status })), [
    { id: "intent", status: "未生成" },
    { id: "summary", status: "未生成" },
    { id: "answer", status: "未生成" },
    { id: "document", status: "未生成" },
  ]);
});
