import {
  parseLarkTicketAiData,
  parseLarkTicketShadowAi,
  pickLarkTicketAiFields,
} from "./lark-ticket-ai.js";

describe("Lark Ticket AI field contract", () => {
  it("keeps only the explicit support-QA and eval fields", () => {
    expect(pickLarkTicketAiFields({
      "AI分析状态": "已分析",
      "AI Gate Eval Score": 100,
      "Issue Description": "source fact",
    })).toEqual({ "AI分析状态": "已分析", "AI Gate Eval Score": 100 });
  });

  it("parses local data without a Lark writeback state", () => {
    const data = parseLarkTicketAiData(JSON.stringify({
      fields: { "AI分析状态": "已分析" },
      updatedAt: "2026-08-14T00:00:00.000Z",
    }));
    expect(data).toMatchObject({ fields: { "AI分析状态": "已分析" } });
    expect(data).not.toHaveProperty("syncedAt");
  });

  it("parses shadow summary payloads for the AI output view", () => {
    const shadow = parseLarkTicketShadowAi(JSON.stringify({
      status: "ok",
      analysis: {
        version: "support-analysis-result-v1",
        analysis: {
          intent: {
            intentType: "troubleshoot",
            intentSubtype: "workflow_stuck",
            confidence: 0.72,
            summary: "订单无法添加促销",
            keywords: ["promotion", "workflow"],
            evidenceMessageIds: ["om_1", "om_2"],
          },
          result: {
            resolutionStatus: "pending",
            solutionSummary: "检查促销配置和订单状态",
            solutionSteps: ["检查促销配置", "确认订单状态"],
            resolverRef: "support-agent",
            resolvedAt: null,
            autoResolvable: false,
            suggestedAutomation: "增加促销配置检查",
            confidence: 0.8,
          },
          quality: {
            scores: {},
            summary: "当前缺少明确处理记录",
            criticalIssues: [],
            warnings: ["缺少具体报错信息"],
          },
        },
        summary: "订单无法添加促销，待排查。",
      },
      analyzedAt: "2026-09-03T05:00:00.000Z",
      processingDurationMs: 3250,
      snapshotVersion: 7,
      promptVersion: "v2",
    }));
    expect(shadow).toEqual({
      status: "ok",
      intent: "troubleshoot / workflow_stuck",
      intentType: "troubleshoot",
      intentSubtype: "workflow_stuck",
      intentConfidence: 0.72,
      intentSummary: "订单无法添加促销",
      keywords: ["promotion", "workflow"],
      evidenceMessageCount: 2,
      summary: "订单无法添加促销，待排查。",
      resolutionStatus: "pending",
      solutionSummary: "检查促销配置和订单状态",
      solutionSteps: ["检查促销配置", "确认订单状态"],
      resolverRef: "support-agent",
      autoResolvable: false,
      suggestedAutomation: "增加促销配置检查",
      resultConfidence: 0.8,
      qualitySummary: "当前缺少明确处理记录",
      warnings: ["缺少具体报错信息"],
      analyzedAt: "2026-09-03T05:00:00.000Z",
      processingDurationMs: 3250,
      snapshotVersion: 7,
      promptVersion: "v2",
    });
  });

  it("parses skipped and error shadow payloads", () => {
    expect(parseLarkTicketShadowAi(JSON.stringify({ status: "skipped", reason: "no_thread_link", analyzedAt: "2026-09-03T05:00:00.000Z" })))
      .toEqual({ status: "skipped", reason: "no_thread_link", analyzedAt: "2026-09-03T05:00:00.000Z" });
    expect(parseLarkTicketShadowAi(JSON.stringify({ status: "error", error: { errorCode: "SHADOW_ACP_FAILED" } })))
      .toEqual({ status: "error", errorCode: "SHADOW_ACP_FAILED" });
    expect(parseLarkTicketShadowAi(JSON.stringify({
      status: "error",
      error: {
        errorCode: "SHADOW_OUTPUT_INVALID",
        errorMessage: "Shadow ACP output did not contain a JSON object.",
        outputChars: 12,
        outputPreview: "抱歉，我无法分析",
      },
    }))).toEqual({
      status: "error",
      errorCode: "SHADOW_OUTPUT_INVALID",
      errorMessage: "Shadow ACP output did not contain a JSON object.",
      outputChars: 12,
      outputPreview: "抱歉，我无法分析",
    });
  });

  it("rejects malformed shadow payloads", () => {
    expect(parseLarkTicketShadowAi("{}")).toBeUndefined();
    expect(parseLarkTicketShadowAi("not json")).toBeUndefined();
    expect(parseLarkTicketShadowAi(null)).toBeUndefined();
    expect(parseLarkTicketShadowAi(JSON.stringify({ status: "pending" }))).toBeUndefined();
    expect(parseLarkTicketShadowAi(JSON.stringify({ status: "ok", processingDurationMs: -1 })))
      .toEqual({ status: "ok" });
  });
});

it("whitelists v2 assessments and context metadata while keeping legacy payloads readable", () => {
  const output = parseLarkTicketShadowAi(JSON.stringify({
    status: "ok", ruleVersion: "v1",
    contextInfo: { source: "stale_cache", historyComplete: false, dirty: true, syncedAt: null, checkedAt: null,
      totalMessages: 10, includedMessages: 2, truncated: true, omittedRanges: ["M2–M9"], compactedMessages: 0, secret: "private" },
    analysis: { version: "shadow-analysis-result-v2", analysis: {
      businessRisk: { level: null, rationale: "影响未知", evidenceMessageIds: [], secret: "private" },
      replyAdvice: { advice: "undetermined", rationale: "缺少最新消息", evidenceMessageIds: ["om_1"] },
    } },
  }));
  expect(output).toMatchObject({ businessRisk: { level: null }, replyAdvice: { advice: "undetermined" }, contextInfo: { truncated: true }, ruleVersion: "v1" });
  expect(JSON.stringify(output)).not.toContain("private");
  const old = parseLarkTicketShadowAi(JSON.stringify({ status: "ok", analysis: { version: "support-analysis-result-v1" } }));
  expect(old).not.toHaveProperty("businessRisk");
  expect(old).not.toHaveProperty("replyAdvice");
});

it("does not project malformed new assessment fields", () => {
  const output = parseLarkTicketShadowAi(JSON.stringify({ status: "ok", analysis: { analysis: {
    businessRisk: { level: 99, rationale: "x", evidenceMessageIds: [] },
    replyAdvice: { advice: "send_automatically", rationale: "x", evidenceMessageIds: [] },
  } } }));
  expect(output).toEqual({ status: "ok" });
});

it("projects Wiki status and source metadata without exposing private raw evidence", () => {
  const value = parseLarkTicketShadowAi(JSON.stringify({ status: "ok", wikiContext: {
    status: "matched", sources: [{ sourceId: 1, title: "相关知识", path: "concepts/report.md", status: "draft", applicability: "historical_reference", limitations: ["待核实"], content: "private raw" }],
    privateField: "private raw",
  }, wikiEvidence: [{ content: "private raw" }] }));
  expect(value).toMatchObject({ wikiContext: { status: "matched", sources: [{ sourceId: 1, title: "相关知识", limitations: ["待核实"] }] } });
  expect(JSON.stringify(value)).not.toContain("private raw");
  expect(value).not.toHaveProperty("wikiEvidence");
  expect(parseLarkTicketShadowAi(JSON.stringify({ status: "ok" }))).not.toHaveProperty("wikiContext");
});
