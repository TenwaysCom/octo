import { createHash } from "node:crypto";
import {
  PostgresPlatformSyncStore,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";
import {
  PostgresLarkTicketThreadSyncStore,
  type LarkTicketThreadSyncStore,
} from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import {
  PostgresSupportTicketAnalysisStore,
  type SupportTicketAnalysisStore,
} from "../../adapters/postgres/support-ticket-analysis-store.js";
import type { SupportAnalysisPayload } from "../../domain/support-ticket-analysis-update.js";
import { redactSupportText, validateSupportEvidence } from "../../domain/support-ticket-analysis.js";

const TAXONOMY_VERSION = "v1";
const RUBRIC_VERSION = "v1";

export class SupportTicketAnalysisError extends Error {
  constructor(
    readonly code: "LARK_TICKET_NOT_FOUND" | "THREAD_SNAPSHOT_NOT_FOUND" | "THREAD_SNAPSHOT_VERSION_CONFLICT" | "INVALID_EVIDENCE_MESSAGE_IDS",
    message: string,
    readonly actionRunId: string,
  ) {
    super(message);
    this.name = "SupportTicketAnalysisError";
  }
}

export interface SupportTicketAnalysisServiceDeps {
  syncStore?: Pick<PlatformSyncStore, "getLarkBaseTicketsForCleaning" | "upsertLarkBaseTicketAi">;
  threadStore?: Pick<LarkTicketThreadSyncStore, "get">;
  analysisStore?: SupportTicketAnalysisStore;
  now?: () => string;
}

export function createSupportTicketAnalysisService(deps: SupportTicketAnalysisServiceDeps = {}) {
  const syncStore = deps.syncStore ?? new PostgresPlatformSyncStore();
  const threadStore = deps.threadStore ?? new PostgresLarkTicketThreadSyncStore();
  const analysisStore = deps.analysisStore ?? new PostgresSupportTicketAnalysisStore();
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    async update(input: {
      ticket: { baseId: string; tableId: string; recordId: string };
      snapshotVersion: number;
      actionRunId: string;
      sourceName: string;
      reviewStatus: "ai_generated" | "reviewed" | "approved";
      reviewerKind: "ai" | "human";
      analysis: SupportAnalysisPayload;
    }) {
      const [ticket] = await syncStore.getLarkBaseTicketsForCleaning([input.ticket]);
      if (!ticket) {
        throw new SupportTicketAnalysisError("LARK_TICKET_NOT_FOUND", "The requested Lark Ticket is not available in the synchronized snapshot.", input.actionRunId);
      }
      const snapshot = await threadStore.get(input.ticket);
      if (!snapshot) {
        throw new SupportTicketAnalysisError("THREAD_SNAPSHOT_NOT_FOUND", "The requested Ticket has no synchronized thread snapshot.", input.actionRunId);
      }
      if (snapshot.snapshotVersion !== input.snapshotVersion) {
        throw new SupportTicketAnalysisError("THREAD_SNAPSHOT_VERSION_CONFLICT", "The analysis snapshot version is no longer current.", input.actionRunId);
      }
      if (!validateSupportEvidence(input.analysis.intent.evidenceMessageIds, snapshot.preparedMessages)) {
        throw new SupportTicketAnalysisError("INVALID_EVIDENCE_MESSAGE_IDS", "Analysis evidence contains Message IDs outside the fixed Ticket snapshot.", input.actionRunId);
      }

      const analysis = redactAnalysis(input.analysis);
      const identity = `${input.ticket.baseId}:${input.ticket.tableId}:${input.ticket.recordId}:${input.snapshotVersion}:${analysis.segmentKey}`;
      const segmentHash = digest(identity);
      const runId = `support-run-${digest(`${identity}:${input.actionRunId}`)}`;
      const updatedAt = now();
      const stored = await analysisStore.upsert({
        analysisRunId: runId,
        actionRunId: input.actionRunId,
        intentSegmentId: `support-segment-${segmentHash}`,
        resultId: `support-result-${segmentHash}`,
        qualityReviewId: `support-quality-${segmentHash}-${input.reviewerKind}`,
        sourceName: input.sourceName,
        taxonomyVersion: TAXONOMY_VERSION,
        rubricVersion: RUBRIC_VERSION,
        ticket: input.ticket,
        snapshotVersion: input.snapshotVersion,
        reviewStatus: input.reviewStatus,
        reviewerKind: input.reviewerKind,
        analysis,
        updatedAt,
      });
      await syncStore.upsertLarkBaseTicketAi({
        ...input.ticket,
        fields: toTicketAiFields(analysis, input.reviewStatus),
      });
      return {
        analysisRunId: runId,
        intentSegmentId: stored.intentSegmentId,
        snapshotVersion: input.snapshotVersion,
        actionRunId: input.actionRunId,
        updatedAt,
      };
    },
  };
}

function toTicketAiFields(
  analysis: SupportAnalysisPayload,
  reviewStatus: "ai_generated" | "reviewed" | "approved",
): Record<string, unknown> {
  const qualityScores = Object.values(analysis.quality.scores);
  return {
    "AI分析状态": "已分析",
    "AI意图识别状态": "已分析",
    "AI意图": analysis.intent.intentSubtype
      ? `${analysis.intent.intentType} / ${analysis.intent.intentSubtype}`
      : analysis.intent.intentType,
    "AI分析版本": `${TAXONOMY_VERSION}/${RUBRIC_VERSION}`,
    "AI Ticket 总结": analysis.intent.summary,
    "AI问题总结状态": "已生成",
    "AI回答状态": analysis.result.solutionSummary ? "已生成" : "未生成",
    ...(analysis.result.solutionSummary ? { "AI回答总结": analysis.result.solutionSummary } : {}),
    "AI处理原因": analysis.quality.summary,
    "AI Confidence": analysis.intent.confidence,
    "AI证据摘要": analysis.intent.evidenceMessageIds.join("、"),
    ...(qualityScores.length ? { "AI LLM Eval Score": qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length } : {}),
    "AI LLM Eval Status": reviewStatus,
    "AI LLM Eval Summary": analysis.quality.summary,
    "AI LLM Eval Critical Issues": analysis.quality.criticalIssues,
    "AI LLM Eval Warnings": analysis.quality.warnings,
  };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function redactAnalysis(analysis: SupportAnalysisPayload): SupportAnalysisPayload {
  return {
    ...analysis,
    intent: {
      ...analysis.intent,
      intentSubtype: analysis.intent.intentSubtype ? redactSupportText(analysis.intent.intentSubtype) : analysis.intent.intentSubtype,
      summary: redactSupportText(analysis.intent.summary),
      keywords: analysis.intent.keywords.map(redactSupportText).filter(Boolean),
    },
    result: {
      ...analysis.result,
      solutionSummary: analysis.result.solutionSummary ? redactSupportText(analysis.result.solutionSummary) : analysis.result.solutionSummary,
      solutionSteps: analysis.result.solutionSteps.map(redactSupportText).filter(Boolean),
      resolverRef: analysis.result.resolverRef ? redactSupportText(analysis.result.resolverRef) : analysis.result.resolverRef,
      suggestedAutomation: analysis.result.suggestedAutomation ? redactSupportText(analysis.result.suggestedAutomation) : analysis.result.suggestedAutomation,
    },
    quality: {
      ...analysis.quality,
      summary: redactSupportText(analysis.quality.summary),
      criticalIssues: analysis.quality.criticalIssues.map(redactSupportText).filter(Boolean),
      warnings: analysis.quality.warnings.map(redactSupportText).filter(Boolean),
    },
  };
}
