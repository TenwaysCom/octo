import { describe, expect, it, vi } from "vitest";
import { createSupportTicketAnalysisService } from "./support-ticket-analysis.service.js";

const ticket = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };
const analysis = {
  segmentKey: "primary",
  intent: {
    intentType: "troubleshoot" as const,
    intentSubtype: "login",
    confidence: 0.9,
    summary: "person@example.com 无法登录",
    keywords: ["login"],
    evidenceMessageIds: ["om_1"],
  },
  result: {
    resolutionStatus: "pending" as const,
    solutionSummary: "联系 person@example.com 收集信息",
    solutionSteps: [],
    resolverRef: "person@example.com",
    resolvedAt: null,
    autoResolvable: false,
    suggestedAutomation: null,
    confidence: 0.8,
  },
  quality: {
    scores: { clarity: 4 },
    summary: "等待 person@example.com 回复",
    criticalIssues: [],
    warnings: [],
  },
};

function createSnapshot() {
  return {
    ...ticket,
    messageLink: "https://example.test/thread",
    threadId: "thread_1",
    messages: [],
    preparedMessages: [{ messageId: "om_1", senderRole: "user" as const, text: "无法登录", hasArtifact: false }],
    snapshotVersion: 3,
    historyComplete: true,
    dirty: false,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  };
}

describe("SupportTicketAnalysisService", () => {
  it("validates the fixed snapshot, redacts content, and stores one atomic update", async () => {
    const analysisStore = { upsert: vi.fn().mockResolvedValue({ intentSegmentId: "segment_1" }) };
    const service = createSupportTicketAnalysisService({
      syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "Ticket" }]) },
      threadStore: { get: vi.fn().mockResolvedValue(createSnapshot()) },
      analysisStore,
      now: () => "2026-09-01T10:05:00.000Z",
    });

    await expect(service.update({
      ticket,
      snapshotVersion: 3,
      actionRunId: "action_1",
      sourceName: "server_ticket_api",
      reviewStatus: "reviewed",
      reviewerKind: "human",
      analysis,
    })).resolves.toEqual(expect.objectContaining({ intentSegmentId: "segment_1", snapshotVersion: 3, actionRunId: "action_1" }));

    expect(analysisStore.upsert).toHaveBeenCalledWith(expect.objectContaining({
      analysis: expect.objectContaining({
        intent: expect.objectContaining({ summary: "[EMAIL] 无法登录" }),
        result: expect.objectContaining({ solutionSummary: "联系 [EMAIL] 收集信息", resolverRef: "[EMAIL]" }),
        quality: expect.objectContaining({ summary: "等待 [EMAIL] 回复" }),
      }),
    }));
  });

  it("rejects stale snapshots and evidence outside prepared messages", async () => {
    const analysisStore = { upsert: vi.fn() };
    const service = createSupportTicketAnalysisService({
      syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "Ticket" }]) },
      threadStore: { get: vi.fn().mockResolvedValue(createSnapshot()) },
      analysisStore: analysisStore as never,
    });

    await expect(service.update({
      ticket,
      snapshotVersion: 2,
      actionRunId: "action_stale",
      sourceName: "server_ticket_api",
      reviewStatus: "reviewed",
      reviewerKind: "human",
      analysis,
    })).rejects.toMatchObject({ code: "THREAD_SNAPSHOT_VERSION_CONFLICT" });

    await expect(service.update({
      ticket,
      snapshotVersion: 3,
      actionRunId: "action_invalid_evidence",
      sourceName: "server_ticket_api",
      reviewStatus: "reviewed",
      reviewerKind: "human",
      analysis: { ...analysis, intent: { ...analysis.intent, evidenceMessageIds: ["om_other"] } },
    })).rejects.toMatchObject({ code: "INVALID_EVIDENCE_MESSAGE_IDS" });
    expect(analysisStore.upsert).not.toHaveBeenCalled();
  });
});
