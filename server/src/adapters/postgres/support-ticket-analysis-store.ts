import type { Kysely } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import type { SupportAnalysisPayload } from "../../domain/support-ticket-analysis-update.js";

export interface SupportTicketAnalysisStoreInput {
  analysisRunId: string;
  actionRunId: string;
  intentSegmentId: string;
  resultId: string;
  qualityReviewId: string;
  sourceName: string;
  taxonomyVersion: string;
  rubricVersion: string;
  ticket: { baseId: string; tableId: string; recordId: string };
  snapshotVersion: number;
  reviewStatus: "ai_generated" | "reviewed" | "approved";
  reviewerKind: "ai" | "human";
  analysis: SupportAnalysisPayload;
  updatedAt: string;
}

export interface SupportTicketAnalysisStore {
  upsert(input: SupportTicketAnalysisStoreInput): Promise<{ intentSegmentId: string }>;
}

export class PostgresSupportTicketAnalysisStore implements SupportTicketAnalysisStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async upsert(input: SupportTicketAnalysisStoreInput): Promise<{ intentSegmentId: string }> {
    return this.database.transaction().execute(async (trx) => {
      await trx.insertInto("support_analysis_runs").values({
        id: input.analysisRunId,
        action_run_id: input.actionRunId,
        source_name: input.sourceName,
        status: "completed",
        taxonomy_version: input.taxonomyVersion,
        rubric_version: input.rubricVersion,
        created_at: input.updatedAt,
        updated_at: input.updatedAt,
      }).onConflict((conflict) => conflict.column("id").doUpdateSet({
        action_run_id: input.actionRunId,
        source_name: input.sourceName,
        status: "completed",
        taxonomy_version: input.taxonomyVersion,
        rubric_version: input.rubricVersion,
        updated_at: input.updatedAt,
      })).execute();

      const existingSegment = await trx.selectFrom("support_thread_intent_segments")
        .select("id")
        .where("base_id", "=", input.ticket.baseId)
        .where("table_id", "=", input.ticket.tableId)
        .where("record_id", "=", input.ticket.recordId)
        .where("snapshot_version", "=", input.snapshotVersion)
        .where("segment_key", "=", input.analysis.segmentKey)
        .executeTakeFirst();
      const intentSegmentId = existingSegment?.id ?? input.intentSegmentId;

      await trx.insertInto("support_thread_intent_segments").values({
        id: intentSegmentId,
        analysis_run_id: input.analysisRunId,
        base_id: input.ticket.baseId,
        table_id: input.ticket.tableId,
        record_id: input.ticket.recordId,
        snapshot_version: input.snapshotVersion,
        segment_key: input.analysis.segmentKey,
        redacted_summary: input.analysis.intent.summary,
        intent_json: JSON.stringify(input.analysis.intent),
        evidence_message_ids_json: JSON.stringify(input.analysis.intent.evidenceMessageIds),
        review_status: input.reviewStatus,
        created_at: input.updatedAt,
        updated_at: input.updatedAt,
      }).onConflict((conflict) => conflict.column("id").doUpdateSet({
        analysis_run_id: input.analysisRunId,
        redacted_summary: input.analysis.intent.summary,
        intent_json: JSON.stringify(input.analysis.intent),
        evidence_message_ids_json: JSON.stringify(input.analysis.intent.evidenceMessageIds),
        review_status: input.reviewStatus,
        updated_at: input.updatedAt,
      })).execute();

      const existingResult = await trx.selectFrom("support_thread_results")
        .select("id")
        .where("intent_segment_id", "=", intentSegmentId)
        .executeTakeFirst();
      await trx.insertInto("support_thread_results").values({
        id: existingResult?.id ?? input.resultId,
        intent_segment_id: intentSegmentId,
        result_json: JSON.stringify(input.analysis.result),
        created_at: input.updatedAt,
        updated_at: input.updatedAt,
      }).onConflict((conflict) => conflict.column("id").doUpdateSet({
        result_json: JSON.stringify(input.analysis.result),
        updated_at: input.updatedAt,
      })).execute();

      const existingQuality = await trx.selectFrom("support_quality_reviews")
        .select("id")
        .where("intent_segment_id", "=", intentSegmentId)
        .where("reviewer_kind", "=", input.reviewerKind)
        .executeTakeFirst();
      await trx.insertInto("support_quality_reviews").values({
        id: existingQuality?.id ?? input.qualityReviewId,
        intent_segment_id: intentSegmentId,
        reviewer_kind: input.reviewerKind,
        score_json: JSON.stringify({
          scores: input.analysis.quality.scores,
          summary: input.analysis.quality.summary,
          warnings: input.analysis.quality.warnings,
        }),
        critical_issues_json: JSON.stringify(input.analysis.quality.criticalIssues),
        created_at: input.updatedAt,
        updated_at: input.updatedAt,
      }).onConflict((conflict) => conflict.column("id").doUpdateSet({
        reviewer_kind: input.reviewerKind,
        score_json: JSON.stringify({
          scores: input.analysis.quality.scores,
          summary: input.analysis.quality.summary,
          warnings: input.analysis.quality.warnings,
        }),
        critical_issues_json: JSON.stringify(input.analysis.quality.criticalIssues),
        updated_at: input.updatedAt,
      })).execute();
      return { intentSegmentId };
    });
  }
}
