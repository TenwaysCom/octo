import { describe, expect, it } from "vitest";
import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresSupportTicketAnalysisStore } from "./support-ticket-analysis-store.js";

const analysis = {
  segmentKey: "primary",
  intent: {
    intentType: "troubleshoot" as const,
    intentSubtype: "login",
    confidence: 0.9,
    summary: "用户无法登录",
    keywords: ["login"],
    evidenceMessageIds: ["om_1"],
  },
  result: {
    resolutionStatus: "pending" as const,
    solutionSummary: null,
    solutionSteps: [],
    resolverRef: null,
    resolvedAt: null,
    autoResolvable: false,
    suggestedAutomation: null,
    confidence: 0.8,
  },
  quality: {
    scores: { clarity: 4 },
    summary: "已收集信息",
    criticalIssues: [],
    warnings: [],
  },
};

describe("PostgresSupportTicketAnalysisStore", () => {
  it("atomically creates and updates one intent, result, and quality projection", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresSupportTicketAnalysisStore(db);
    const baseInput = {
      analysisRunId: "run_1",
      actionRunId: "action_1",
      intentSegmentId: "segment_1",
      resultId: "result_1",
      qualityReviewId: "quality_1",
      sourceName: "server_ticket_api",
      taxonomyVersion: "v1",
      rubricVersion: "v1",
      ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
      snapshotVersion: 3,
      reviewStatus: "reviewed" as const,
      reviewerKind: "human" as const,
      analysis,
      updatedAt: "2026-09-01T10:00:00.000Z",
    };

    await expect(store.upsert(baseInput)).resolves.toEqual({ intentSegmentId: "segment_1" });
    await expect(store.upsert({
      ...baseInput,
      analysisRunId: "run_2",
      actionRunId: "action_2",
      intentSegmentId: "different_generated_id",
      resultId: "different_result_id",
      qualityReviewId: "different_quality_id",
      analysis: {
        ...analysis,
        intent: { ...analysis.intent, summary: "用户登录恢复" },
        result: { ...analysis.result, resolutionStatus: "resolved" as const, solutionSummary: "重置账号后恢复" },
        quality: { ...analysis.quality, summary: "处理完成" },
      },
      updatedAt: "2026-09-01T10:05:00.000Z",
    })).resolves.toEqual({ intentSegmentId: "segment_1" });

    const segments = await db.selectFrom("support_thread_intent_segments").selectAll().execute();
    const results = await db.selectFrom("support_thread_results").selectAll().execute();
    const quality = await db.selectFrom("support_quality_reviews").selectAll().execute();
    expect(segments).toHaveLength(1);
    expect(results).toHaveLength(1);
    expect(quality).toHaveLength(1);
    await expect(db.selectFrom("support_analysis_runs").select(["id", "action_run_id"]).orderBy("id").execute()).resolves.toEqual([
      { id: "run_1", action_run_id: "action_1" },
      { id: "run_2", action_run_id: "action_2" },
    ]);
    expect(JSON.parse(segments[0].intent_json)).toEqual(expect.objectContaining({ summary: "用户登录恢复" }));
    expect(JSON.parse(results[0].result_json)).toEqual(expect.objectContaining({ resolutionStatus: "resolved" }));
    expect(JSON.parse(quality[0].score_json)).toEqual(expect.objectContaining({ summary: "处理完成" }));
  });
});
