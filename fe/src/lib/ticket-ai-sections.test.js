import assert from "node:assert/strict";
import test from "node:test";
import { getTicketAiSections, getTicketAiShadowItems, getTicketAiShadowNotice, hasTicketAiValue } from "./ticket-ai-sections.js";

test("treats only meaningful Ticket AI values as populated", () => {
  assert.equal(hasTicketAiValue(undefined), false);
  assert.equal(hasTicketAiValue("  "), false);
  assert.equal(hasTicketAiValue([]), false);
  assert.equal(hasTicketAiValue("skip"), true);
  assert.equal(hasTicketAiValue(0), true);
  assert.equal(hasTicketAiValue({ text: "已分析" }), true);
});

test("groups Ticket AI fields in stable business order and omits empty details", () => {
  const sections = getTicketAiSections({
    "AI LLM Eval Score": 86,
    "AI Ticket 总结": "权限恢复后正常",
    "AI分析状态": "需人工确认",
    "AI建议产物": "skip",
  });

  assert.deepEqual(sections.map((section) => ({
    id: section.id,
    hasData: section.hasData,
    itemNames: section.items.map((item) => item.name),
    summaryNames: section.summary.map((item) => item.name),
  })), [
    {
      id: "analysis",
      hasData: true,
      itemNames: ["AI Ticket 总结", "AI分析状态"],
      summaryNames: ["AI Ticket 总结", "AI分析状态"],
    },
    {
      id: "knowledge",
      hasData: true,
      itemNames: ["AI建议产物"],
      summaryNames: ["AI建议产物"],
    },
    {
      id: "evidence",
      hasData: true,
      itemNames: ["AI LLM Eval Score"],
      summaryNames: ["AI LLM Eval Score"],
    },
  ]);
});

test("fills empty sections with shadow analysis fields and summary lines", () => {
  const sections = getTicketAiSections({}, {
    status: "ok",
    intent: "bug_report / permission",
    intentConfidence: 0.72,
    summary: "用户再次遇到服务单访问错误",
    resolutionStatus: "resolved",
    solutionSummary: "客服已临时处理服务单，恢复访问",
    solutionSteps: ["确认服务单状态", "恢复访问权限"],
    keywords: ["access error", "SER162526"],
    evidenceMessageCount: 2,
    criticalIssues: [],
    warnings: ["存在一条告警"],
  });

  assert.deepEqual(sections.map((section) => ({
    id: section.id,
    hasData: section.hasData,
    hasFormalData: section.hasFormalData,
    hasShadowData: section.hasShadowData,
    shadowItemNames: section.shadowItems.map((item) => item.name),
  })), [
    {
      id: "analysis",
      hasData: true,
      hasFormalData: false,
      hasShadowData: true,
      shadowItemNames: ["意图", "置信度", "问题总结", "处理状态"],
    },
    {
      id: "knowledge",
      hasData: true,
      hasFormalData: false,
      hasShadowData: true,
      shadowItemNames: ["方案摘要", "处理步骤"],
    },
    {
      id: "evidence",
      hasData: true,
      hasFormalData: false,
      hasShadowData: true,
      shadowItemNames: ["关键词", "证据", "警告"],
    },
  ]);
  assert.equal(sections[0].shadowSummary, "bug_report / permission · 72% · 已解决");
  assert.equal(sections[1].shadowSummary, "客服已临时处理服务单，恢复访问");
  assert.match(sections[2].shadowSummary, /证据 2 条 · 严重 0 · 警告 1/);
});

test("keeps formal data primary while still exposing shadow items", () => {
  const [analysis] = getTicketAiSections({ "AI Ticket 总结": "权限恢复后正常" }, {
    status: "ok",
    intent: "bug_report",
    intentConfidence: 0.72,
    summary: "影子总结",
  });
  assert.equal(analysis.hasFormalData, true);
  assert.equal(analysis.hasShadowData, true);
  assert.equal(analysis.hasData, true);
  assert.equal(analysis.shadowItems.length > 0, true);
});

test("ignores non-ok shadow analysis and reports a notice instead", () => {
  const errorSections = getTicketAiSections({}, { status: "error", errorCode: "SHADOW_FAILED", errorMessage: "LLM 超时" });
  assert.equal(errorSections.every((section) => !section.hasData && section.shadowItems.length === 0), true);
  assert.equal(getTicketAiShadowNotice({ status: "error", errorCode: "SHADOW_FAILED", errorMessage: "LLM 超时" }), "SHADOW_FAILED：LLM 超时");
  assert.equal(getTicketAiShadowNotice({ status: "skipped", reason: "票已关闭" }), "影子分析已跳过：票已关闭");
  assert.equal(getTicketAiShadowNotice({ status: "ok" }), "");
  assert.equal(getTicketAiShadowNotice(undefined), "");
});

test("getTicketAiShadowItems only reads fields of its own section", () => {
  const shadowAi = {
    status: "ok",
    intent: "bug_report",
    intentConfidence: 0.5,
    summary: "总结",
    solutionSummary: "方案",
    keywords: ["k1"],
    evidenceMessageCount: 0,
  };
  assert.deepEqual(getTicketAiShadowItems("evidence", shadowAi).map((item) => item.name), ["关键词", "证据"]);
  assert.equal(getTicketAiShadowItems("evidence", shadowAi)[1].value, "0 条");
  assert.deepEqual(getTicketAiShadowItems("unknown", shadowAi), []);
});
