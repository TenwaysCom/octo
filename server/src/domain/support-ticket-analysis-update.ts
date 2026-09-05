import { z } from "zod";
import { SUPPORT_INTENT_SUBTYPES, SUPPORT_INTENT_TYPES } from "./support-ticket-analysis.js";

const shortText = z.string().trim().min(1).max(500);
const optionalText = z.string().trim().min(1).max(500).optional().nullable();

export const supportIntentUpdateSchema = z.object({
  intentType: z.enum(SUPPORT_INTENT_TYPES),
  intentSubtype: optionalText,
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1).max(2000),
  keywords: z.array(shortText).max(10).default([]),
  evidenceMessageIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100)
    .refine((values) => new Set(values).size === values.length, "Evidence message IDs must be unique."),
}).strict();

export const supportResultUpdateSchema = z.object({
  resolutionStatus: z.enum(["resolved", "pending", "escalated", "needs_info", "auto_closed"]),
  solutionSummary: z.string().trim().max(4000).optional().nullable(),
  solutionSteps: z.array(z.string().trim().min(1).max(1000)).max(30).default([]),
  resolverRef: z.string().trim().min(1).max(200).optional().nullable(),
  resolvedAt: z.string().datetime({ offset: true }).optional().nullable(),
  autoResolvable: z.boolean().default(false),
  suggestedAutomation: z.string().trim().max(2000).optional().nullable(),
  confidence: z.number().min(0).max(1),
}).strict();

export const supportQualityUpdateSchema = z.object({
  scores: z.record(z.string().trim().min(1).max(100), z.number().min(0).max(5)).default({}),
  summary: z.string().trim().min(1).max(4000),
  criticalIssues: z.array(z.string().trim().min(1).max(1000)).max(30).default([]),
  warnings: z.array(z.string().trim().min(1).max(1000)).max(30).default([]),
}).strict();

export const supportAnalysisPayloadSchema = z.object({
  segmentKey: z.string().trim().min(1).max(120).default("primary"),
  intent: supportIntentUpdateSchema,
  result: supportResultUpdateSchema,
  quality: supportQualityUpdateSchema,
}).strict();

export type SupportAnalysisPayload = z.infer<typeof supportAnalysisPayloadSchema>;

export const supportAnalysisResultSchema = z.object({
  version: z.literal("support-analysis-result-v1"),
  analysis: supportAnalysisPayloadSchema,
  summary: z.string().trim().min(1).max(2000),
}).strict().superRefine((value, context) => {
  const { intentType, intentSubtype } = value.analysis.intent;
  if (!intentSubtype || !SUPPORT_INTENT_SUBTYPES[intentType].includes(intentSubtype)) {
    context.addIssue({
      code: "custom",
      path: ["analysis", "intent", "intentSubtype"],
      message: `intentSubtype must belong to ${intentType}.`,
    });
  }
});

export type SupportAnalysisResult = z.infer<typeof supportAnalysisResultSchema>;

export function buildSupportQaFetchInstruction(ticketNumber: string): string {
  return `这是一个受控执行任务。不得在第一条受控操作前输出结论。

第一条操作必须通过 ACP Terminal 拉取当前 Ticket 证据，命令必须逐字等于：
\`bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch ${ticketNumber} --json\`
后续回答只能基于 Terminal 实际退出码为 0 的证据和当前 Ticket 上下文。执行失败时必须明确报告失败，不得改用其他 Bash、shell、MCP 或网络命令。`;
}
