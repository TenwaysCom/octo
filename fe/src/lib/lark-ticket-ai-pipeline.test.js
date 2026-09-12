import assert from "node:assert/strict";
import test from "node:test";
import { getLarkTicketAiOutputMarker, getLarkTicketAiPipeline } from "./lark-ticket-ai-pipeline.js";

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
    { id: "intent", status: "已生成", summary: "troubleshoot / workflow_stuck", shadow: true },
    { id: "summary", status: "已生成", summary: "订单无法添加促销，待排查。", shadow: true },
    { id: "answer", status: "Shadow · 已处理", summary: "暂无输出", shadow: false },
    { id: "document", status: "未生成", summary: "暂无输出", shadow: false },
  ]);
});

test("shows only formal AI state when present and falls back to Shadow state", () => {
  assert.deepEqual(getLarkTicketAiOutputMarker({ ticketAi: { fields: {} }, shadowAi: { status: "ok" } }), {
    label: "Shadow 已处理",
    tone: "ready",
  });
  assert.deepEqual(getLarkTicketAiOutputMarker({ ticketAi: { fields: { "AI意图": "bug_report" } }, shadowAi: { status: "ok" } }), {
    label: "AI",
    tone: "ready",
  });
  assert.deepEqual(getLarkTicketAiOutputMarker({ ticketAi: { fields: {} }, shadowAi: { status: "error" } }), {
    label: "Shadow 失败",
    tone: "error",
  });
  assert.deepEqual(getLarkTicketAiOutputMarker({ ticketAi: { fields: {} } }), {
    label: "AI 未输出",
    tone: "default",
  });
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
  assert.ok(intent.shadowDetails.length > 0);
  assert.ok(summary.shadowDetails.length > 0);
});

test("maps Shadow result and quality details into the existing answer stage without generating a document", () => {
  const pipeline = getLarkTicketAiPipeline({
    ticketAi: { fields: {} },
    shadowAi: {
      status: "ok",
      intent: "troubleshoot / workflow_stuck",
      intentConfidence: 0.72,
      keywords: ["promotion"],
      evidenceMessageCount: 2,
      summary: "订单无法添加促销，待排查。",
      resolutionStatus: "pending",
      solutionSummary: "检查促销配置和订单状态",
      solutionSteps: ["检查促销配置", "确认订单状态"],
      autoResolvable: false,
      resultConfidence: 0.8,
      qualitySummary: "当前缺少明确处理记录",
      warnings: ["缺少具体报错信息"],
    },
  });
  const [intent, summary, answer, document] = pipeline;

  assert.equal(intent.shadowDetails.find(({ label }) => label === "证据").value, "2 条");
  assert.equal(summary.summary, "订单无法添加促销，待排查。");
  assert.equal(answer.status, "Shadow · 待处理");
  assert.equal(answer.statusTone, "shadow");
  assert.equal(answer.summary, "检查促销配置和订单状态");
  assert.equal(answer.shadow, undefined);
  assert.equal(answer.shadowDetails.find(({ label }) => label === "处理状态").value, "待处理");
  assert.equal(answer.shadowDetails.find(({ label }) => label === "质量摘要").value, "当前缺少明确处理记录");
  assert.equal(document.status, "未生成");
  assert.equal(document.shadowDetails, undefined);
});

test("non-ok shadow results are not merged", () => {
  const pipeline = getLarkTicketAiPipeline({
    ticketAi: { fields: {} },
    shadowAi: { status: "error", errorCode: "SHADOW_ACP_FAILED" },
  });
  assert.deepEqual(pipeline.map(({ id, status }) => ({ id, status })), [
    { id: "intent", status: "未生成" },
    { id: "summary", status: "未生成" },
    { id: "answer", status: "Shadow · 失败" },
    { id: "document", status: "未生成" },
  ]);
  assert.equal(pipeline[2].statusTone, "error");
});

test("keeps the formal answer status when a production answer exists", () => {
  const answer = getLarkTicketAiPipeline({
    ticketAi: { fields: { "AI回答总结": "正式答案", "AI回答状态": "已生成" } },
    shadowAi: { status: "ok", resolutionStatus: "pending", solutionSummary: "Shadow 方案" },
  })[2];

  assert.equal(answer.status, "已生成");
  assert.equal(answer.statusTone, undefined);
  assert.equal(answer.summary, "正式答案");
});

test("shows skipped Shadow state in the answer stage when no formal answer exists", () => {
  const answer = getLarkTicketAiPipeline({
    ticketAi: { fields: {} },
    shadowAi: { status: "skipped", reason: "no_messages" },
  })[2];

  assert.equal(answer.status, "Shadow · 已跳过");
  assert.equal(answer.statusTone, "empty");
  assert.equal(answer.summary, "暂无输出");
});
