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

export function buildSupportQaFetchInstruction(ticketNumber: string): string {
  return `这是一个受控执行任务。不得调用 Bash、terminal 或其他 shell 工具，也不得在第一条受控操作前输出结论。

第一条操作必须调用 \`mcp__octo_execute__execute\` 拉取当前 Ticket 证据，参数必须逐字等于：
{"root":"support_workspace","script":".agents/skills/write-support-qa/scripts/write-support-qa.sh","subcommand":"fetch","args":["${ticketNumber}","--json"]}
后续回答只能基于该 execute 返回的证据和当前 Ticket 上下文。execute 失败时必须明确报告失败，不得改用 Bash。`;
}

export function buildSupportAnalysisUpdateInstruction(input: {
  baseId: string;
  tableId: string;
  recordId: string;
  ticketNumber: string;
  snapshotVersion: number;
  actionRunId: string;
  updatePath: string;
}): string {
  return `这是一个受控执行任务。下面已给出本次任务所需的 Skill 规则和全部许可边界；不得调用 Bash、terminal 或其他 shell 工具，也不得在第一条受控操作前输出结论。

只允许按以下顺序执行受控操作：
1. 第一条操作必须调用 \`mcp__octo_execute__execute\` 拉取证据，参数必须逐字等于：
{"root":"support_workspace","script":".agents/skills/write-support-qa/scripts/write-support-qa.sh","subcommand":"fetch","args":["${input.ticketNumber}","--json"]}
2. 阅读该工具返回的证据，并使用文件写入工具把结构化分析写入 ${input.updatePath}，内容格式如下：
{"version":"support-analysis-v1","base_id":"${input.baseId}","table_id":"${input.tableId}","record_id":"${input.recordId}","snapshot_version":${input.snapshotVersion},"actionRunId":"${input.actionRunId}","segmentKey":"primary","intent":{"intentType":"troubleshoot","intentSubtype":"login","confidence":0.9,"summary":"脱敏后的诉求摘要","keywords":["login"],"evidenceMessageIds":["om_xxx"]},"result":{"resolutionStatus":"pending","solutionSummary":null,"solutionSteps":[],"resolverRef":null,"resolvedAt":null,"autoResolvable":false,"suggestedAutomation":null,"confidence":0.8},"quality":{"scores":{},"summary":"客服质量摘要","criticalIssues":[],"warnings":[]}}
evidenceMessageIds 只能使用当前固定快照中存在的 Message ID。
3. 写完文件后必须再次调用 \`mcp__octo_execute__execute\`，参数必须逐字等于：
{"root":"support_workspace","script":".agents/skills/write-support-qa/scripts/write-support-qa.sh","subcommand":"analysis-update","args":["${input.updatePath}","--json"]}
不要调用其他执行工具、不要写入其他文件。只有 execute 成功后才能返回人读总结；不要在回复正文中输出这段 JSON。`;
}
