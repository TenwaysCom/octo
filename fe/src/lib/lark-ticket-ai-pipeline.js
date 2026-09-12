import {
  getShadowResolutionLabel,
  getShadowStageDetails,
} from "./lark-ticket-shadow-ai.js";

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasValue);
  return true;
}

function text(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("、");
  if (typeof value === "object") return value.text || value.name || "";
  return String(value);
}

function stage(id, title, fields, statusFields, options = {}) {
  const winner = fields.find((field) => hasValue(field.value));
  const status = statusFields.map((field) => field.value).find(hasValue);
  const statusText = text(status);
  const fromShadow = Boolean(winner?.shadow) && (!hasValue(status) || statusText === "未生成");
  const shadowIsStageOutput = fromShadow && !options.preserveFormalStatus;
  const shadowDetails = getShadowStageDetails(options.shadowAi, id);
  return {
    id,
    title,
    status: options.statusOverride || (shadowIsStageOutput
      ? options.shadowStatus || "已生成"
      : statusText || (winner && !winner.shadow ? "已生成" : options.fallbackStatus || "未生成")),
    ...(options.statusTone ? { statusTone: options.statusTone } : {}),
    summary: text(winner?.value) || "暂无输出",
    ...(shadowIsStageOutput ? { shadow: true } : {}),
    ...(shadowDetails.length ? { shadowDetails } : {}),
  };
}

function getShadowAnswerStatus(shadowAi) {
  if (!shadowAi?.status) return undefined;
  if (shadowAi.status === "error") return { label: "Shadow · 失败", tone: "error" };
  if (shadowAi.status === "skipped") return { label: "Shadow · 已跳过", tone: "empty" };
  if (shadowAi.status !== "ok") return undefined;
  const resolution = getShadowResolutionLabel(shadowAi.resolutionStatus);
  return { label: `Shadow · ${resolution || "已处理"}`, tone: "shadow" };
}

export function getLarkTicketAiPipeline(ticket) {
  const fields = ticket.ticketAi?.fields || {};
  const shadow = ticket.shadowAi?.status === "ok" ? ticket.shadowAi : undefined;
  const formalAnswer = fields["AI回答总结"];
  const shadowAnswer = shadow?.solutionSummary || getShadowResolutionLabel(shadow?.resolutionStatus);
  const shadowAnswerStatus = hasValue(formalAnswer) ? undefined : getShadowAnswerStatus(ticket.shadowAi);
  return [
    stage("intent", "意图识别", [{ value: fields["AI意图"] }, { value: fields["AI Bug 分类"] }, { value: shadow?.intent, shadow: true }], [{ value: fields["AI意图识别状态"] }, { value: fields["AI分析状态"] }], { shadowAi: ticket.shadowAi }),
    stage("summary", "问题总结", [{ value: fields["AI Ticket 总结"] }, { value: shadow?.summary, shadow: true }], [{ value: fields["AI问题总结状态"] }, { value: fields["AI分析状态"] }], { shadowAi: ticket.shadowAi }),
    stage("answer", "Ticket 答案总结", [{ value: formalAnswer }, { value: shadowAnswer, shadow: true }], [{ value: fields["AI回答状态"] }], {
      shadowAi: ticket.shadowAi,
      preserveFormalStatus: true,
      statusOverride: shadowAnswerStatus?.label,
      statusTone: shadowAnswerStatus?.tone,
    }),
    stage("document", "文档生成", [{ value: fields["AI文档摘要"] }, { value: fields["AI建议产物"] }, { value: fields["QA Card 动作"] }, { value: fields["FAQ 动作"] }], [{ value: fields["AI文档生成状态"] }]),
  ];
}

export function getLarkTicketAiOutputMarker(ticket) {
  const hasAiOutput = Boolean(Object.keys(ticket.ticketAi?.fields || {}).length);
  const shadowLabels = { ok: "Shadow 已处理", skipped: "Shadow 已跳过", error: "Shadow 失败" };
  const label = hasAiOutput ? "AI" : shadowLabels[ticket.shadowAi?.status] || "AI 未输出";
  const tone = hasAiOutput || ticket.shadowAi?.status === "ok"
    ? "ready"
    : ticket.shadowAi?.status === "error" ? "error" : "default";
  return { label, tone };
}
