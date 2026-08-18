export const TICKET_AI_SECTIONS = [
  {
    id: "analysis",
    title: "AI 分析",
    emptyMessage: "暂无 AI 分析结果。",
    summaryFields: ["AI Ticket 总结", "AI分析状态"],
    fields: [
      "AI Ticket 总结",
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
    summaryFields: ["AI可复用等级", "AI建议产物"],
    fields: [
      "AI知识沉淀类型",
      "AI可复用等级",
      "AI建议产物",
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

export function hasTicketAiValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasTicketAiValue);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function getTicketAiSections(fields = {}) {
  return TICKET_AI_SECTIONS.map((section) => {
    const items = section.fields.flatMap((name) => (
      hasTicketAiValue(fields[name]) ? [{ name, value: fields[name] }] : []
    ));
    const summary = section.summaryFields.flatMap((name) => (
      hasTicketAiValue(fields[name]) ? [{ name, value: fields[name] }] : []
    ));
    return { ...section, items, summary, hasData: items.length > 0 };
  });
}
