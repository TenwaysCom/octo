export const LARK_TICKET_AI_FIELD_NAMES = [
  "AI分析状态",
  "AI意图识别状态",
  "AI意图",
  "AI分析版本",
  "AI知识沉淀类型",
  "AI可复用等级",
  "AI建议产物",
  "AI Bug 分类",
  "AI Root Cause",
  "AI Ticket 总结",
  "AI问题总结状态",
  "AI回答状态",
  "AI回答总结",
  "AI文档生成状态",
  "AI文档摘要",
  "AI处理原因",
  "QA Card 动作",
  "QA Card 路径",
  "AI 影响对象",
  "AI 业务流程",
  "AI Support缺失信息",
  "AI QA回归建议",
  "AI Confidence",
  "AI证据摘要",
  "FAQ 动作",
  "AI Gate Eval Score",
  "AI Gate Eval Status",
  "AI Gate Eval Critical Issues",
  "AI Gate Eval Warnings",
  "AI LLM Eval Score",
  "AI LLM Eval Status",
  "AI LLM Eval Summary",
  "AI LLM Eval Critical Issues",
  "AI LLM Eval Warnings",
] as const;

const larkTicketAiFieldNameSet = new Set<string>(LARK_TICKET_AI_FIELD_NAMES);

export type LarkTicketAiFields = Record<string, unknown>;

export interface LarkTicketAiData {
  fields: LarkTicketAiFields;
  updatedAt?: string;
}

export function pickLarkTicketAiFields(value: Record<string, unknown> | undefined): LarkTicketAiFields {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).filter(([name]) => larkTicketAiFieldNameSet.has(name)));
}

export interface LarkTicketShadowAi {
  status: "ok" | "skipped" | "error";
  intent?: string;
  intentConfidence?: number;
  summary?: string;
  analyzedAt?: string;
  snapshotVersion?: number;
  promptVersion?: string;
  reason?: string;
  errorCode?: string;
}

export function parseLarkTicketShadowAi(value: string | null | undefined): LarkTicketShadowAi | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const candidate = parsed as Record<string, unknown>;
    const status = candidate.status;
    if (status !== "ok" && status !== "skipped" && status !== "error") return undefined;
    const analysis = candidate.analysis as Record<string, unknown> | undefined;
    const intent = analysis?.analysis && typeof analysis.analysis === "object"
      ? (analysis.analysis as Record<string, unknown>).intent as Record<string, unknown> | undefined
      : undefined;
    const intentType = typeof intent?.intentType === "string" ? intent.intentType : "";
    const intentSubtype = typeof intent?.intentSubtype === "string" ? intent.intentSubtype : "";
    return {
      status,
      ...(intentType ? { intent: intentSubtype ? `${intentType} / ${intentSubtype}` : intentType } : {}),
      ...(typeof intent?.confidence === "number" ? { intentConfidence: intent.confidence } : {}),
      ...(typeof candidate.summary === "string" && candidate.summary.trim()
        ? { summary: candidate.summary }
        : typeof analysis?.summary === "string" && analysis.summary.trim()
          ? { summary: analysis.summary }
          : {}),
      ...(typeof candidate.analyzedAt === "string" ? { analyzedAt: candidate.analyzedAt } : {}),
      ...(typeof candidate.snapshotVersion === "number" ? { snapshotVersion: candidate.snapshotVersion } : {}),
      ...(typeof candidate.promptVersion === "string" ? { promptVersion: candidate.promptVersion } : {}),
      ...(typeof candidate.reason === "string" ? { reason: candidate.reason } : {}),
      ...(typeof (candidate.error as Record<string, unknown> | undefined)?.errorCode === "string"
        ? { errorCode: (candidate.error as Record<string, unknown>).errorCode as string }
        : {}),
    };
  } catch {
    return undefined;
  }
}

export function parseLarkTicketAiData(value: string | null | undefined): LarkTicketAiData | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const candidate = parsed as { fields?: unknown; updatedAt?: unknown };
    if (!candidate.fields || typeof candidate.fields !== "object" || Array.isArray(candidate.fields)) return undefined;
    const fields = pickLarkTicketAiFields(candidate.fields as Record<string, unknown>);
    if (!Object.keys(fields).length) return undefined;
    return {
      fields,
      ...(typeof candidate.updatedAt === "string" ? { updatedAt: candidate.updatedAt } : {}),
    };
  } catch {
    return undefined;
  }
}
