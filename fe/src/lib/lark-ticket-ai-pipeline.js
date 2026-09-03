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

function stage(id, title, fields, statusFields, fallbackStatus = "未生成") {
  const value = fields.map((field) => field.value).find(hasValue);
  const status = statusFields.map((field) => field.value).find(hasValue);
  return { id, title, status: text(status) || (hasValue(value) ? "已生成" : fallbackStatus), summary: text(value) || "暂无输出" };
}

export function getLarkTicketAiPipeline(ticket) {
  const fields = ticket.ticketAi?.fields || {};
  return [
    stage("intent", "意图识别", [{ value: fields["AI意图"] }, { value: fields["AI Bug 分类"] }], [{ value: fields["AI意图识别状态"] }, { value: fields["AI分析状态"] }]),
    stage("summary", "问题总结", [{ value: fields["AI Ticket 总结"] }], [{ value: fields["AI问题总结状态"] }, { value: fields["AI分析状态"] }]),
    stage("answer", "Ticket 答案总结", [{ value: fields["AI回答总结"] }], [{ value: fields["AI回答状态"] }]),
    stage("document", "文档生成", [{ value: fields["AI文档摘要"] }, { value: fields["AI建议产物"] }, { value: fields["QA Card 动作"] }, { value: fields["FAQ 动作"] }], [{ value: fields["AI文档生成状态"] }]),
  ];
}
