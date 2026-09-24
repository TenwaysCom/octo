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

const REPLY_ADVICE_LABELS = {
  reply_now: "立即回复",
  reply_by_deadline: "按时限回复",
  normal_follow_up: "常规跟进",
  no_reply_needed: "暂无需回复",
  undetermined: "无法判断",
};

export function getShadowAssessmentDetails(shadowAi) {
  if (shadowAi?.status !== "ok") return [];
  const { businessRisk: risk, replyAdvice: reply, contextInfo: context } = shadowAi;
  return compactDetails([
    ["业务风险", !risk ? "未评估" : risk.level == null ? "待确认" : `${risk.level}/9`],
    ["风险依据", risk?.rationale],
    ["风险证据", risk ? `${risk.evidenceMessageIds?.length || 0} 条消息` : ""],
    ["回复时机（分析时）", reply ? REPLY_ADVICE_LABELS[reply.advice] || "无法判断" : "未评估"],
    ["回复依据", reply?.rationale],
    ["回复证据", reply ? `${reply.evidenceMessageIds?.length || 0} 条消息` : ""],
    ["消息上下文", context ? `${context.includedMessages}/${context.totalMessages} 条；${context.historyComplete ? "快照历史完整" : "快照历史不完整"}${context.truncated ? "；部分消息已省略" : ""}${context.dirty ? "；快照待更新" : ""}${context.source === "stale_cache" ? "；同步失败，使用旧缓存" : ""}` : ""],
    ["省略范围", context?.omittedRanges?.join("、")],
    ["快照同步时间", context ? context.syncedAt ? formatDateTime(context.syncedAt) : "未知" : ""],
    ["Wiki 参考", shadowAi.wikiContext ? ({ matched: `已参考 ${shadowAi.wikiContext.sources.length} 篇相关资料`, no_matches: "未召回相关资料", unavailable: "Wiki 不可用，本次仅基于聊天分析" })[shadowAi.wikiContext.status] : ""],
    ["Wiki 来源", shadowAi.wikiContext?.sources?.map((source) => `[W${source.sourceId}] ${source.title}（${source.status === "confirmed" ? "已确认" : source.status === "draft" ? "草稿" : "状态待确认"}；${source.applicability === "historical_reference" ? "仅供历史参考" : "相关参考"}）\n来源：docs/llm-wiki/${source.path}${source.limitations.length ? `\n局限：${source.limitations.join("；")}` : ""}`).join("\n\n")],
    ["规则版本", shadowAi.ruleVersion],
  ]);
}

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
      ...getShadowAssessmentDetails(shadowAi).map(({ label, value }) => [label, value]),
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
