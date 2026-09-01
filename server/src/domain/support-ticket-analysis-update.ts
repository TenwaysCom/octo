import { z } from "zod";
import { SUPPORT_INTENT_TYPES } from "./support-ticket-analysis.js";

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

export function buildSupportAnalysisUpdateInstruction(input: {
  baseId: string;
  tableId: string;
  recordId: string;
  snapshotVersion: number;
  actionRunId: string;
  updatePath: string;
}): string {
  return `完成问题总结前，必须把结构化分析写入 ${input.updatePath}，内容格式如下：
{"version":"support-analysis-v1","base_id":"${input.baseId}","table_id":"${input.tableId}","record_id":"${input.recordId}","snapshot_version":${input.snapshotVersion},"actionRunId":"${input.actionRunId}","segmentKey":"primary","intent":{"intentType":"troubleshoot","intentSubtype":"login","confidence":0.9,"summary":"脱敏后的诉求摘要","keywords":["login"],"evidenceMessageIds":["om_xxx"]},"result":{"resolutionStatus":"pending","solutionSummary":null,"solutionSteps":[],"resolverRef":null,"resolvedAt":null,"autoResolvable":false,"suggestedAutomation":null,"confidence":0.8},"quality":{"scores":{},"summary":"客服质量摘要","criticalIssues":[],"warnings":[]}}
evidenceMessageIds 只能使用当前固定快照中存在的 Message ID。写完文件后必须执行且只能执行：
bash .agents/skills/write-support-qa/scripts/write-support-qa.sh analysis-update ${input.updatePath} --json
只有命令成功后才能返回人读总结；不要在回复正文中输出这段 JSON。`;
}
