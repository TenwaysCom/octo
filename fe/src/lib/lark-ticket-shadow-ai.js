import { formatDateTime } from "./formatters.js";

const SHADOW_STATUS_LABELS = {
  ok: "已生成",
  skipped: "已跳过",
  error: "失败",
};

const RESOLUTION_STATUS_LABELS = {
  resolved: "已解决",
  pending: "待处理",
  escalated: "已升级",
  needs_info: "需要补充信息",
  auto_closed: "自动关闭",
};

export function getShadowStatusLabel(status) {
  return SHADOW_STATUS_LABELS[status] || status || "未知";
}

export function getShadowResolutionLabel(status) {
  return RESOLUTION_STATUS_LABELS[status] || status || "";
}

export function getShadowIntentLabel(shadowAi) {
  if (shadowAi?.intent) return shadowAi.intent;
  if (!shadowAi?.intentType) return "";
  return shadowAi.intentSubtype
    ? `${shadowAi.intentType} / ${shadowAi.intentSubtype}`
    : shadowAi.intentType;
}

export function formatShadowConfidence(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "";
}

export function formatShadowDuration(durationMs) {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) return "";
  if (durationMs < 1000) return "< 1 秒";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

export function getShadowStageDetails(shadowAi, stageId) {
  if (!shadowAi || stageId === "document") return [];
  if (shadowAi.status !== "ok") {
    return compactDetails([
      ["状态", getShadowStatusLabel(shadowAi.status)],
      ["原因", shadowAi.reason],
      ["错误码", shadowAi.errorCode],
      ["错误信息", shadowAi.errorMessage],
      ["分析时间", shadowAi.analyzedAt ? formatDateTime(shadowAi.analyzedAt) : ""],
      ["耗时", formatShadowDuration(shadowAi.processingDurationMs)],
    ]);
  }

  if (stageId === "intent") {
    return compactDetails([
      ["意图", getShadowIntentLabel(shadowAi)],
      ["置信度", formatShadowConfidence(shadowAi.intentConfidence)],
      ["关键词", joinValues(shadowAi.keywords)],
      ["证据", typeof shadowAi.evidenceMessageCount === "number" ? `${shadowAi.evidenceMessageCount} 条` : ""],
    ]);
  }

  if (stageId === "summary") {
    return compactDetails([
      ["问题总结", shadowAi.summary],
      ["意图摘要", shadowAi.intentSummary],
      ["分析时间", shadowAi.analyzedAt ? formatDateTime(shadowAi.analyzedAt) : ""],
      ["耗时", formatShadowDuration(shadowAi.processingDurationMs)],
      ["快照版本", typeof shadowAi.snapshotVersion === "number" ? `v${shadowAi.snapshotVersion}` : ""],
      ["Prompt 版本", shadowAi.promptVersion],
    ]);
  }

  if (stageId === "answer") {
    return compactDetails([
      ["处理状态", getShadowResolutionLabel(shadowAi.resolutionStatus)],
      ["方案摘要", shadowAi.solutionSummary],
      ["答案置信", formatShadowConfidence(shadowAi.resultConfidence)],
      ["处理步骤", numberedValues(shadowAi.solutionSteps)],
      ["处理人", shadowAi.resolverRef],
      ["解决时间", shadowAi.resolvedAt ? formatDateTime(shadowAi.resolvedAt) : ""],
      ["自动处理", typeof shadowAi.autoResolvable === "boolean" ? shadowAi.autoResolvable ? "是" : "否" : ""],
      ["自动化建议", shadowAi.suggestedAutomation],
      ["质量摘要", shadowAi.qualitySummary],
      ["严重问题", numberedValues(shadowAi.criticalIssues)],
      ["警告", numberedValues(shadowAi.warnings)],
    ]);
  }

  return [];
}

function compactDetails(entries) {
  return entries.flatMap(([label, value]) => value == null || value === ""
    ? []
    : [{ label, value: String(value) }]);
}

function joinValues(values) {
  return Array.isArray(values) ? values.filter(Boolean).join("、") : "";
}

function numberedValues(values) {
  return Array.isArray(values)
    ? values.filter(Boolean).map((value, index) => `${index + 1}. ${value}`).join("\n")
    : "";
}
