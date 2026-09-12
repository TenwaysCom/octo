import { formatDateTime } from "./formatters.js";
import {
  formatShadowConfidence,
  getShadowIntentLabel,
  getShadowResolutionLabel,
} from "./lark-ticket-shadow-ai.js";

export const TICKET_AI_SECTIONS = [
  {
    id: "analysis",
    title: "AI 分析",
    emptyMessage: "暂无 AI 分析结果。",
    summaryFields: ["AI Ticket 总结", "AI意图", "AI分析状态"],
    fields: [
      "AI Ticket 总结",
      "AI意图识别状态",
      "AI意图",
      "AI问题总结状态",
      "AI回答状态",
      "AI回答总结",
      "AI分析状态",
      "AI Bug 分类",
      "AI Root Cause",
      "AI处理原因",
      "AI 影响对象",
      "AI 业务流程",
      "AI Confidence",
      "AI分析版本",
    ],
  },
  {
    id: "knowledge",
    title: "知识沉淀",
    emptyMessage: "暂无知识沉淀结论。",
    summaryFields: ["AI可复用等级", "AI建议产物", "AI文档生成状态"],
    fields: [
      "AI知识沉淀类型",
      "AI可复用等级",
      "AI建议产物",
      "AI文档生成状态",
      "AI文档摘要",
      "QA Card 动作",
      "QA Card 路径",
      "FAQ 动作",
    ],
  },
  {
    id: "evidence",
    title: "证据与回归",
    emptyMessage: "暂无证据或回归建议。",
    summaryFields: ["AI LLM Eval Status", "AI LLM Eval Score"],
    fields: [
      "AI证据摘要",
      "AI Support缺失信息",
      "AI QA回归建议",
      "AI Gate Eval Score",
      "AI Gate Eval Status",
      "AI Gate Eval Critical Issues",
      "AI Gate Eval Warnings",
      "AI LLM Eval Score",
      "AI LLM Eval Status",
      "AI LLM Eval Summary",
      "AI LLM Eval Critical Issues",
      "AI LLM Eval Warnings",
    ],
  },
];

const SHADOW_SECTION_FIELDS = {
  analysis: [
    ["意图", (shadow) => getShadowIntentLabel(shadow)],
    ["置信度", (shadow) => formatShadowConfidence(shadow.intentConfidence)],
    ["问题总结", (shadow) => shadow.summary],
    ["意图摘要", (shadow) => shadow.intentSummary],
    ["处理状态", (shadow) => getShadowResolutionLabel(shadow.resolutionStatus)],
    ["处理人", (shadow) => shadow.resolverRef],
    ["解决时间", (shadow) => shadow.resolvedAt ? formatDateTime(shadow.resolvedAt) : ""],
  ],
  knowledge: [
    ["方案摘要", (shadow) => shadow.solutionSummary],
    ["答案置信", (shadow) => formatShadowConfidence(shadow.resultConfidence)],
    ["处理步骤", (shadow) => numberedShadowValues(shadow.solutionSteps)],
    ["质量摘要", (shadow) => shadow.qualitySummary],
    ["自动处理", (shadow) => typeof shadow.autoResolvable === "boolean" ? (shadow.autoResolvable ? "是" : "否") : ""],
    ["自动化建议", (shadow) => shadow.suggestedAutomation],
  ],
  evidence: [
    ["关键词", (shadow) => Array.isArray(shadow.keywords) ? shadow.keywords.filter(Boolean).join("、") : ""],
    ["证据", (shadow) => typeof shadow.evidenceMessageCount === "number" ? `${shadow.evidenceMessageCount} 条` : ""],
    ["严重问题", (shadow) => numberedShadowValues(shadow.criticalIssues)],
    ["警告", (shadow) => numberedShadowValues(shadow.warnings)],
  ],
};

export function hasTicketAiValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasTicketAiValue);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function getTicketAiShadowItems(sectionId, shadowAi) {
  if (shadowAi?.status !== "ok") return [];
  return (SHADOW_SECTION_FIELDS[sectionId] || []).flatMap(([name, read]) => {
    const value = read(shadowAi);
    return hasTicketAiValue(value) ? [{ name, value }] : [];
  });
}

function getTicketAiShadowSummaryLine(sectionId, shadowAi) {
  if (sectionId === "analysis") {
    return [
      getShadowIntentLabel(shadowAi),
      formatShadowConfidence(shadowAi.intentConfidence),
      getShadowResolutionLabel(shadowAi.resolutionStatus),
    ].filter(Boolean).join(" · ");
  }
  if (sectionId === "knowledge") return shadowAi.solutionSummary || "";
  if (sectionId === "evidence") {
    const parts = [];
    if (typeof shadowAi.evidenceMessageCount === "number") parts.push(`证据 ${shadowAi.evidenceMessageCount} 条`);
    parts.push(`严重 ${shadowAi.criticalIssues?.length || 0} · 警告 ${shadowAi.warnings?.length || 0}`);
    return parts.join(" · ");
  }
  return "";
}

export function getTicketAiShadowNotice(shadowAi) {
  if (!shadowAi || shadowAi.status === "ok") return "";
  if (shadowAi.status === "skipped") return `影子分析已跳过：${shadowAi.reason || "未记录原因"}`;
  return `${shadowAi.errorCode || "SHADOW_FAILED"}${shadowAi.errorMessage ? `：${shadowAi.errorMessage}` : ""}`;
}

export function getTicketAiSections(fields = {}, shadowAi) {
  return TICKET_AI_SECTIONS.map((section) => {
    const items = section.fields.flatMap((name) => (
      hasTicketAiValue(fields[name]) ? [{ name, value: fields[name] }] : []
    ));
    const summary = section.summaryFields.flatMap((name) => (
      hasTicketAiValue(fields[name]) ? [{ name, value: fields[name] }] : []
    ));
    const shadowItems = getTicketAiShadowItems(section.id, shadowAi);
    const hasFormalData = items.length > 0;
    const hasShadowData = shadowItems.length > 0;
    const shadowSummary = hasShadowData
      ? (getTicketAiShadowSummaryLine(section.id, shadowAi) || shadowItems[0].value)
      : "";
    return {
      ...section,
      items,
      summary,
      shadowItems,
      shadowSummary,
      hasFormalData,
      hasShadowData,
      hasData: hasFormalData || hasShadowData,
    };
  });
}

function numberedShadowValues(values) {
  return Array.isArray(values)
    ? values.filter(Boolean).map((value, index) => `${index + 1}. ${value}`).join("\n")
    : "";
}
