import { executeTicketEval, ticketEvalRequestSchema, type TicketEvalRequest } from "./ticket-eval.service.js";
import { WIKI_QA_PROMPTS } from "../../domain/workflow-prompts.js";

const request = (): TicketEvalRequest => ({ scenario: "ticket.early_analysis", actionRunId: "eval-1",
  messages: [{ messageId: "m1", createdAt: "2026-09-24T00:00:00Z", senderRole: "user", text: "订单确认失败", hasArtifact: false }],
  exclusionTokens: ["rec-current"], config: { provider: "deepseek", model: "test", timeoutMs: 1000,
    prompts: { "lark_ticket.support_qa.summarize": "{{ticket_context}}\n{{user_message}}" } } });
const output = (ids = ["m1"]) => ({ version: "support-analysis-result-v1", analysis: {
  segmentKey: "primary", intent: { intentType: "troubleshoot", confidence: .8, summary: "订单确认失败", keywords: [], evidenceMessageIds: ids },
  result: { resolutionStatus: "pending", solutionSummary: null, solutionSteps: [], resolverRef: null,
    resolvedAt: null, autoResolvable: false, suggestedAutomation: null, confidence: .8 },
  quality: { scores: {}, summary: "尚未解决", criticalIssues: [], warnings: [] } }, summary: "订单确认失败" });

describe("offline ticket eval service", () => {
  it("rejects expected answers and other extra fields at execution boundary", () => {
    expect(() => ticketEvalRequestSchema.parse({ ...request(), expected: "SECRET_GOLD" })).toThrow();
    expect(() => ticketEvalRequestSchema.parse({ ...request(), ticket: { solution: "SECRET" } })).toThrow();
  });
  it("runs shared shadow validation with only the window and preserves raw completion", async () => {
    const createJsonCompletion = vi.fn().mockResolvedValue({ content: JSON.stringify(output()), model: "test" });
    const result = await executeTicketEval(request(), { client: { createJsonCompletion } });
    expect(result.status).toBe("ok");
    expect(createJsonCompletion.mock.calls[0][0].prompt).toContain("订单确认失败");
    expect(result.calls[0].content).toBe(JSON.stringify(output()));
  });
  it("classifies evidence outside the window as an invalid output, not an infrastructure error", async () => {
    const result = await executeTicketEval(request(), { client: {
      createJsonCompletion: async () => ({ content: JSON.stringify(output(["future-message"])), model: "test" }),
    } });
    expect(result).toMatchObject({ status: "invalid_output", error: { errorCode: "SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT" } });
    expect(result.calls).toHaveLength(1);
  });
  it("does not expose provider exception payloads", async () => {
    const result = await executeTicketEval(request(), { client: {
      createJsonCompletion: async () => { throw new Error("secret-token"); },
    } });
    expect(result.status).toBe("error"); expect(JSON.stringify(result)).not.toContain("secret-token");
  });
  it("runs real Wiki QA orchestration and removes identified same-ticket candidates", async () => {
    const input = request(); input.scenario = "ticket.reply";
    input.config.wikiWorkspace = "/unused-mock";
    input.config.rerank = { mode: "general", url: "https://example.test/rerank", model: "test", minScore: .7 };
    input.config.prompts = Object.fromEntries(Object.values(WIKI_QA_PROMPTS).map(p => [p.key, p.prompt]));
    const createJsonCompletion = vi.fn()
      .mockResolvedValueOnce({ content: JSON.stringify({ question: "订单确认失败？", keywords: ["订单"], objects: [], environments: [] }), model: "test" })
      .mockResolvedValueOnce({ content: JSON.stringify({ answerMarkdown: "请提供报错信息。" }), model: "test" });
    const rerank = vi.fn();
    const result = await executeTicketEval(input, { client: { createJsonCompletion }, rerankClient: { rerank },
      reader: { search: async () => [{ id: "wiki-1", path: "faq/rec-current.md", title: "订单", content: "FUTURE_SOLUTION",
        status: "draft", environments: [], sourceEvidence: [], limitations: [], historicalOnly: true }] } });
    expect(result.status).toBe("ok"); expect(rerank).not.toHaveBeenCalled();
    expect(JSON.stringify(createJsonCompletion.mock.calls)).not.toContain("FUTURE_SOLUTION");
    expect(createJsonCompletion).toHaveBeenCalledTimes(2);
  });
});
