import { describe, expect, it } from "vitest";
import {
  buildSupportQaFetchInstruction,
  buildSupportAnalysisUpdateInstruction,
  supportAnalysisPayloadSchema,
} from "./support-ticket-analysis-update.js";

it("builds a shell-free Support-QA fetch instruction bound to the current Ticket", () => {
  expect(buildSupportQaFetchInstruction("LT-10")).toContain("mcp__octo_execute__execute");
  expect(buildSupportQaFetchInstruction("LT-10")).toContain('"subcommand":"fetch","args":["LT-10","--json"]');
  expect(buildSupportQaFetchInstruction("LT-10")).toContain("不得调用 Bash");
});

describe("support Ticket analysis update contract", () => {
  it("validates the structured analysis payload", () => {
    const result = supportAnalysisPayloadSchema.parse({
      segmentKey: "primary",
      intent: { intentType: "troubleshoot", intentSubtype: "login", confidence: 0.9, summary: "用户无法登录", keywords: ["login"], evidenceMessageIds: ["om_1"] },
      result: { resolutionStatus: "pending", solutionSummary: null, solutionSteps: [], resolverRef: null, resolvedAt: null, autoResolvable: false, suggestedAutomation: null, confidence: 0.8 },
      quality: { scores: { clarity: 4 }, summary: "已收集初步信息", criticalIssues: [], warnings: ["等待用户回复"] },
    });

    expect(result).toEqual(expect.objectContaining({
      segmentKey: "primary",
      intent: expect.objectContaining({ intentType: "troubleshoot", evidenceMessageIds: ["om_1"] }),
      result: expect.objectContaining({ resolutionStatus: "pending" }),
      quality: expect.objectContaining({ scores: { clarity: 4 } }),
    }));
  });

  it("rejects out-of-contract analysis and renders the constrained ACP update instruction", () => {
    expect(() => supportAnalysisPayloadSchema.parse({
      segmentKey: "primary",
      intent: { intentType: "unknown", confidence: 2, summary: "x", keywords: [], evidenceMessageIds: [] },
      result: { resolutionStatus: "pending", solutionSteps: [], autoResolvable: false, confidence: 0.8 },
      quality: { scores: {}, summary: "x", criticalIssues: [], warnings: [] },
    })).toThrow();
    expect(buildSupportAnalysisUpdateInstruction({
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      ticketNumber: "LT-10",
      snapshotVersion: 3,
      actionRunId: "action_1",
      updatePath: "/tmp/support-qa/support-analysis-1.json",
    })).toContain('"subcommand":"analysis-update"');
    expect(buildSupportAnalysisUpdateInstruction({
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      ticketNumber: "LT-10",
      snapshotVersion: 3,
      actionRunId: "action_1",
      updatePath: "/tmp/support-qa/support-analysis-1.json",
    })).toContain('"subcommand":"fetch"');
  });
});
