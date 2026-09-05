import { describe, expect, it } from "vitest";
import {
  buildSupportQaFetchInstruction,
  supportAnalysisPayloadSchema,
  supportAnalysisResultSchema,
} from "./support-ticket-analysis-update.js";

it("builds an ACP Terminal fetch instruction bound to the current Ticket", () => {
  expect(buildSupportQaFetchInstruction("LT-10")).toContain("bash .agents/skills/write-support-qa/scripts/write-support-qa.sh fetch LT-10 --json");
  expect(buildSupportQaFetchInstruction("LT-10")).toContain("Terminal 实际退出码为 0");
  expect(buildSupportQaFetchInstruction("LT-10")).not.toContain("mcp__octo");
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

  it("validates the provider result envelope used by Ticket Summary", () => {
    const result = supportAnalysisResultSchema.parse({
      version: "support-analysis-result-v1",
      analysis: {
        segmentKey: "primary",
        intent: { intentType: "troubleshoot", intentSubtype: "integration_sync", confidence: 0.9, summary: "订单未同步", keywords: ["integration_sync"], evidenceMessageIds: ["om_1"] },
        result: { resolutionStatus: "pending", solutionSummary: null, solutionSteps: [], resolverRef: null, resolvedAt: null, autoResolvable: false, suggestedAutomation: null, confidence: 0.8 },
        quality: { scores: {}, summary: "等待排查", criticalIssues: [], warnings: [] },
      },
      summary: "订单同步异常，当前仍待排查。",
    });

    expect(result.summary).toBe("订单同步异常，当前仍待排查。");
    expect(result.analysis.intent.evidenceMessageIds).toEqual(["om_1"]);
  });

  it("rejects an intent subtype outside its selected intent type", () => {
    expect(() => supportAnalysisResultSchema.parse({
      version: "support-analysis-result-v1",
      analysis: {
        segmentKey: "primary",
        intent: { intentType: "troubleshoot", intentSubtype: "grant_permission", confidence: 0.9, summary: "问题", keywords: [], evidenceMessageIds: ["om_1"] },
        result: { resolutionStatus: "pending", solutionSummary: null, solutionSteps: [], resolverRef: null, resolvedAt: null, autoResolvable: false, suggestedAutomation: null, confidence: 0.8 },
        quality: { scores: {}, summary: "待处理", criticalIssues: [], warnings: [] },
      },
      summary: "问题总结",
    })).toThrow();
  });

  it("rejects out-of-contract analysis", () => {
    expect(() => supportAnalysisPayloadSchema.parse({
      segmentKey: "primary",
      intent: { intentType: "unknown", confidence: 2, summary: "x", keywords: [], evidenceMessageIds: [] },
      result: { resolutionStatus: "pending", solutionSteps: [], autoResolvable: false, confidence: 0.8 },
      quality: { scores: {}, summary: "x", criticalIssues: [], warnings: [] },
    })).toThrow();
  });
});
