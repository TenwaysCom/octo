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
  intentType?: string;
  intentSubtype?: string;
  intentConfidence?: number;
  intentSummary?: string;
  keywords?: string[];
  evidenceMessageCount?: number;
  summary?: string;
  resolutionStatus?: "resolved" | "pending" | "escalated" | "needs_info" | "auto_closed";
  solutionSummary?: string;
  solutionSteps?: string[];
  resolverRef?: string;
  resolvedAt?: string;
  autoResolvable?: boolean;
  suggestedAutomation?: string;
  resultConfidence?: number;
  qualitySummary?: string;
  criticalIssues?: string[];
  warnings?: string[];
  analyzedAt?: string;
  processingDurationMs?: number;
  snapshotVersion?: number;
  promptVersion?: string;
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  outputChars?: number;
  outputPreview?: string;
}

export function parseLarkTicketShadowAi(value: string | null | undefined): LarkTicketShadowAi | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const candidate = parsed as Record<string, unknown>;
    const status = candidate.status;
    if (status !== "ok" && status !== "skipped" && status !== "error") return undefined;
    const analysis = asRecord(candidate.analysis);
    const analysisPayload = asRecord(analysis?.analysis);
    const intent = asRecord(analysisPayload?.intent);
    const result = asRecord(analysisPayload?.result);
    const quality = asRecord(analysisPayload?.quality);
    const intentType = typeof intent?.intentType === "string" ? intent.intentType : "";
    const intentSubtype = typeof intent?.intentSubtype === "string" ? intent.intentSubtype : "";
    const keywords = readStringArray(intent?.keywords);
    const evidenceMessageIds = readStringArray(intent?.evidenceMessageIds);
    const resolutionStatus = isResolutionStatus(result?.resolutionStatus) ? result.resolutionStatus : undefined;
    const solutionSteps = readStringArray(result?.solutionSteps);
    const criticalIssues = readStringArray(quality?.criticalIssues);
    const warnings = readStringArray(quality?.warnings);
    return {
      status,
      ...(intentType ? { intent: intentSubtype ? `${intentType} / ${intentSubtype}` : intentType, intentType } : {}),
      ...(intentSubtype ? { intentSubtype } : {}),
      ...(typeof intent?.confidence === "number" ? { intentConfidence: intent.confidence } : {}),
      ...(typeof intent?.summary === "string" && intent.summary.trim() ? { intentSummary: intent.summary } : {}),
      ...(keywords.length ? { keywords } : {}),
      ...(Array.isArray(intent?.evidenceMessageIds) ? { evidenceMessageCount: evidenceMessageIds.length } : {}),
      ...(typeof candidate.summary === "string" && candidate.summary.trim()
        ? { summary: candidate.summary }
        : typeof analysis?.summary === "string" && analysis.summary.trim()
          ? { summary: analysis.summary }
          : {}),
      ...(resolutionStatus ? { resolutionStatus } : {}),
      ...(typeof result?.solutionSummary === "string" && result.solutionSummary.trim() ? { solutionSummary: result.solutionSummary } : {}),
      ...(solutionSteps.length ? { solutionSteps } : {}),
      ...(typeof result?.resolverRef === "string" && result.resolverRef.trim() ? { resolverRef: result.resolverRef } : {}),
      ...(typeof result?.resolvedAt === "string" ? { resolvedAt: result.resolvedAt } : {}),
      ...(typeof result?.autoResolvable === "boolean" ? { autoResolvable: result.autoResolvable } : {}),
      ...(typeof result?.suggestedAutomation === "string" && result.suggestedAutomation.trim() ? { suggestedAutomation: result.suggestedAutomation } : {}),
      ...(typeof result?.confidence === "number" ? { resultConfidence: result.confidence } : {}),
      ...(typeof quality?.summary === "string" && quality.summary.trim() ? { qualitySummary: quality.summary } : {}),
      ...(criticalIssues.length ? { criticalIssues } : {}),
      ...(warnings.length ? { warnings } : {}),
      ...(typeof candidate.analyzedAt === "string" ? { analyzedAt: candidate.analyzedAt } : {}),
      ...(isNonNegativeSafeInteger(candidate.processingDurationMs)
        ? { processingDurationMs: candidate.processingDurationMs }
        : {}),
      ...(typeof candidate.snapshotVersion === "number" ? { snapshotVersion: candidate.snapshotVersion } : {}),
      ...(typeof candidate.promptVersion === "string" ? { promptVersion: candidate.promptVersion } : {}),
      ...(typeof candidate.reason === "string" ? { reason: candidate.reason } : {}),
      ...(() => {
        const error = candidate.error as Record<string, unknown> | undefined;
        if (!error || typeof error !== "object") return {};
        return {
          ...(typeof error.errorCode === "string" ? { errorCode: error.errorCode } : {}),
          ...(typeof error.errorMessage === "string" ? { errorMessage: error.errorMessage } : {}),
          ...(typeof error.outputChars === "number" ? { outputChars: error.outputChars } : {}),
          ...(typeof error.outputPreview === "string" ? { outputPreview: error.outputPreview } : {}),
        };
      })(),
    };
  } catch {
    return undefined;
  }
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function isResolutionStatus(value: unknown): value is NonNullable<LarkTicketShadowAi["resolutionStatus"]> {
  return value === "resolved"
    || value === "pending"
    || value === "escalated"
    || value === "needs_info"
    || value === "auto_closed";
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
