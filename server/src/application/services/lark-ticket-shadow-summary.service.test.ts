import { createWikiQaService } from "./wiki-qa.service.js";
import { WikiQaError, type WikiKnowledgeEvidence } from "../../domain/wiki-qa.js";
import type { LarkBaseTicketSyncItem } from "../../adapters/postgres/platform-sync-store.js";
import type { LarkTicketThreadSnapshot } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import { DeepSeekChatError } from "../../adapters/deepseek/deepseek-chat-client.js";
import { ZcodeChatError } from "../../adapters/zcode/zcode-chat-client.js";
import {
  createLarkTicketShadowSummaryService,
  LarkTicketShadowSummaryError,
} from "./lark-ticket-shadow-summary.service.js";

const PROMPT_TEMPLATE = "当前 Ticket：\n{{ticket_context}}\n\n用户请求：\n{{user_message}}\n请输出 JSON。";

function makeTicket(overrides: Partial<LarkBaseTicketSyncItem> = {}): LarkBaseTicketSyncItem {
  return {
    baseId: "base-1",
    tableId: "table-1",
    recordId: "rec-1",
    title: "ticket record：订单无法添加促销",
    ticketStatus: "New",
    ticketNumber: "2132",
    issueType: "配置",
    larkMessageLink: "https://example.com/messenger?threadid=omt_1",
    sourceFields: {
      "Issue Description": "not able to add the promotion to this order.",
      "Business line": "B2B sales",
    },
    sourceUpdatedAt: "2026-09-03T01:00:00.000Z",
    syncedAt: "2026-09-03T02:00:00.000Z",
    ...overrides,
  };
}

function makeSnapshot(messageIds: string[] = ["om_1", "om_2"]): LarkTicketThreadSnapshot {
  return {
    baseId: "base-1",
    tableId: "table-1",
    recordId: "rec-1",
    messageLink: "https://example.com/messenger?threadid=omt_1",
    threadId: "omt_1",
    messages: [],
    preparedMessages: messageIds.map((messageId, index) => ({
      messageId,
      senderRole: index === 0 ? "user" : "bot",
      senderLabel: index === 0 ? "用户 1" : "客服机器人",
      createdAt: "2026-09-03T01:00:00.000Z",
      text: "消息内容",
      hasArtifact: false,
    })),
    snapshotVersion: 7,
    historyComplete: true,
    dirty: false,
    createdAt: "2026-09-03T01:00:00.000Z",
    updatedAt: "2026-09-03T01:00:00.000Z",
  } as LarkTicketThreadSnapshot;
}

function validAnalysisJson(evidenceMessageIds: string[] = ["M1"]): string {
  return JSON.stringify({
    version: "shadow-analysis-result-v2",
    analysis: {
      segmentKey: "primary",
      intent: {
        intentType: "troubleshoot",
        intentSubtype: "workflow_stuck",
        confidence: 0.72,
        summary: "订单无法添加促销",
        keywords: ["promotion"],
        evidenceMessageIds,
      },
      result: {
        resolutionStatus: "pending",
        solutionSummary: null,
        solutionSteps: [],
        resolverRef: null,
        resolvedAt: null,
        autoResolvable: false,
        suggestedAutomation: null,
        confidence: 0.8,
      },
      quality: { scores: {}, summary: "暂无处理记录", criticalIssues: [], warnings: [] },
      businessRisk: { level: null, rationale: "缺少影响范围，无法分级。", evidenceMessageIds: [] },
      replyAdvice: { advice: "undetermined", rationale: "无法确定处理方。", evidenceMessageIds: [] },
    },
    summary: "订单无法添加促销，待排查。",
  });
}

function makeDeps(input: {
  candidates?: LarkBaseTicketSyncItem[];
  threadResult?: { source: "none" | "cache" | "lark" | "stale_cache"; snapshot?: LarkTicketThreadSnapshot };
  deepSeekText?: string;
  deepSeekError?: Error;
  prompt?: string;
  promptKey?: string;
  now?: () => Date;
  wikiQaService?: Pick<ReturnType<typeof createWikiQaService>, "retrieve">;
}) {
  const writes: Array<Record<string, unknown>> = [];
  const prompts: string[] = [];
  const actionRunIds: string[] = [];
  const reasoningEfforts: Array<string | undefined> = [];
  const promptKeys: string[] = [];
  const service = createLarkTicketShadowSummaryService({
    masterUserId: "master-1",
    wikiQaService: input.wikiQaService ?? { retrieve: async () => ({ question: "test question", evidence: [] }) },
    larkBaseUrl: "https://open.feishu.cn",
    now: input.now ?? (() => new Date("2026-09-03T05:00:00.000Z")),
    syncStore: {
      listLarkTicketShadowSummaryCandidates: async () => input.candidates ?? [],
      upsertLarkBaseTicketShadowAi: async ({ shadow }) => {
        writes.push(shadow);
      },
    },
    threadContext: {
      ensure: async () => ({
        decision: "full",
        source: input.threadResult?.source ?? "lark",
        threadId: "omt_1",
        snapshot: input.threadResult?.snapshot,
      }),
    },
    ticketSummaryClient: {
      createJsonCompletion: async ({ prompt, actionRunId, reasoningEffort }) => {
        reasoningEfforts.push(reasoningEffort);
        prompts.push(prompt);
        actionRunIds.push(actionRunId);
        if (input.deepSeekError) throw input.deepSeekError;
        return {
          content: input.deepSeekText ?? validAnalysisJson(),
          model: "deepseek-v4-flash",
        };
      },
    },
    promptStore: {
      getByKey: async (key: string) => { promptKeys.push(key); return input.prompt === undefined
        ? { key, prompt: PROMPT_TEMPLATE, note: null, createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" }
        : input.prompt
          ? { key, prompt: input.prompt, note: null, createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" }
          : undefined; },
    },
    promptKey: input.promptKey,
  });
  return { service, writes, prompts, actionRunIds, promptKeys, reasoningEfforts };
}

describe("lark-ticket-shadow-summary.service", () => {
  it.each([
    [undefined, "low"], ["", "low"], ["low", "low"],
    ["high", "high"], ["max", "max"], ["provider", undefined],
  ])("uses shared Wiki reasoning effort %s for final analysis", async (configured, expected) => {
    vi.stubEnv("WIKI_QA_ANSWER_REASONING_EFFORT", configured);
    try {
      const { service, reasoningEfforts } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() } });
      expect((await service.runOnce()).summarized).toBe(1);
      expect(reasoningEfforts).toEqual([expected]);
    } finally { vi.unstubAllEnvs(); }
  });

  it("rejects invalid shared effort before requesting final analysis", async () => {
    vi.stubEnv("WIKI_QA_ANSWER_REASONING_EFFORT", "invalid");
    try {
      const { service, reasoningEfforts } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() } });
      expect((await service.runOnce()).failed).toBe(1);
      expect(reasoningEfforts).toEqual([]);
    } finally { vi.unstubAllEnvs(); }
  });

  it("summarizes a candidate and writes the ok shadow payload", async () => {
    const times = [
      "2026-09-03T05:00:00.000Z",
      "2026-09-03T05:00:00.000Z",
      "2026-09-03T05:00:03.250Z",
    ];
    const { service, writes, prompts, actionRunIds } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      now: () => new Date(times.shift() ?? "2026-09-03T05:00:03.250Z"),
    });

    const result = await service.runOnce();

    expect(result).toEqual({ considered: 1, summarized: 1, skipped: 0, failed: 0 });
    expect(writes).toHaveLength(1);
    const shadow = writes[0] as { status: string; analysis: { analysis: { intent: { intentType: string } } }; processingDurationMs: number; snapshotVersion: number; promptVersion: string };
    expect(shadow.status).toBe("ok");
    expect(shadow.analysis.analysis.intent.intentType).toBe("troubleshoot");
    expect(shadow.snapshotVersion).toBe(7);
    expect(shadow.promptVersion).toBe("v6");
    expect(shadow.processingDurationMs).toBe(3250);
    expect(prompts[0]).toContain("订单无法添加促销");
    expect(prompts[0]).toContain("M1");
    expect(prompts[0]).not.toContain("om_1");
    expect(writes[0]).toMatchObject({ analysis: { analysis: { intent: { evidenceMessageIds: ["om_1"] } } } });
    expect(actionRunIds[0]).toEqual(expect.any(String));
  });

  it("marks tickets without a thread link as skipped", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket({ larkMessageLink: undefined })],
      threadResult: { source: "none" },
    });

    const result = await service.runOnce();

    expect(result).toEqual({ considered: 1, summarized: 0, skipped: 1, failed: 0 });
    expect((writes[0] as { status: string; reason: string }).status).toBe("skipped");
    expect((writes[0] as { reason: string }).reason).toBe("no_thread_link");
    expect((writes[0] as { processingDurationMs: number }).processingDurationMs).toBe(0);
  });

  it("marks snapshots without prepared messages as skipped", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot([]) },
    });

    const result = await service.runOnce();

    expect(result.skipped).toBe(1);
    expect((writes[0] as { reason: string }).reason).toBe("no_messages");
  });

  it("writes an error shadow when the DeepSeek output is not valid JSON", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      deepSeekText: "这不是 JSON",
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    const shadow = writes[0] as { status: string; processingDurationMs: number; error: { errorCode: string; errorMessage: string; outputChars: number; outputPreview?: string } };
    expect(shadow.status).toBe("error");
    expect(shadow.processingDurationMs).toBe(0);
    expect(shadow.error.errorCode).toBe("SHADOW_OUTPUT_INVALID");
    expect(shadow.error.outputChars).toBe("这不是 JSON".length);
    expect(shadow.error.outputPreview).toBeUndefined();
  });

  it("writes an error shadow when the DeepSeek output is empty", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      deepSeekText: "   ",
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    const shadow = writes[0] as { error: { errorCode: string; errorMessage: string; outputChars: number } };
    expect(shadow.error.errorCode).toBe("SHADOW_OUTPUT_INVALID");
    expect(shadow.error.errorMessage).toBe("Shadow Ticket summary output did not contain a JSON object.");
    expect(shadow.error.outputChars).toBe(3);
  });

  it("writes an error shadow when the DeepSeek output fails schema validation", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      deepSeekText: JSON.stringify({ version: "shadow-analysis-result-v2", analysis: { intent: { intentType: "feature_request" } } }),
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    const shadow = writes[0] as { error: { errorCode: string; errorMessage: string; outputChars: number; outputPreview?: string } };
    expect(shadow.error.errorCode).toBe("SHADOW_OUTPUT_INVALID");
    expect(shadow.error.errorMessage).toContain("schema validation");
    expect(shadow.error.outputPreview).toBeUndefined();
  });

  it("rejects evidence message IDs outside the fixed snapshot", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot(["om_1"]) },
      deepSeekText: validAnalysisJson(["om_not_in_snapshot"]),
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    expect((writes[0] as { error: { errorCode: string } }).error.errorCode).toBe("SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT");
  });

  it("persists typed DeepSeek response errors", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      deepSeekError: new DeepSeekChatError(
        "DEEPSEEK_RESPONSE_INVALID",
        "DeepSeek returned an empty or truncated completion.",
      ),
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    const shadow = writes[0] as { error: { errorCode: string; errorMessage: string } };
    expect(shadow.error.errorCode).toBe("DEEPSEEK_RESPONSE_INVALID");
    expect(shadow.error.errorMessage).toContain("empty or truncated");
  });

  it("persists typed ZCode response errors", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      deepSeekError: new ZcodeChatError(
        "ZCODE_RESPONSE_INVALID",
        "ZCode returned an empty or truncated completion.",
      ),
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    expect((writes[0] as { error: { errorCode: string } }).error.errorCode).toBe("ZCODE_RESPONSE_INVALID");
  });

  it("persists DeepSeek request status without response content", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      deepSeekError: new DeepSeekChatError("DEEPSEEK_REQUEST_FAILED", "DeepSeek request failed with status 429.", 429),
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    const shadow = writes[0] as { error: { errorCode: string; errorMessage: string; statusCode: number } };
    expect(shadow.error.errorCode).toBe("DEEPSEEK_REQUEST_FAILED");
    expect(shadow.error.errorMessage).toContain("status 429");
    expect(shadow.error.statusCode).toBe(429);
  });

  it("writes an error shadow when the DeepSeek call fails unexpectedly", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      deepSeekError: new Error("connection failed"),
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    expect((writes[0] as { error: { errorCode: string } }).error.errorCode).toBe("DEEPSEEK_REQUEST_FAILED");
  });

  it("uses the built-in default when the database prompt is missing", async () => {
    const { service, prompts } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      prompt: "",
    });

    await expect(service.runOnce()).resolves.toMatchObject({ summarized: 1 });
    expect(prompts[0]).toContain("intentType");
  });

  it("fails fast when neither the database nor a built-in prompt is configured", async () => {
    const { service } = makeDeps({ prompt: "", promptKey: "unknown.prompt" });

    await expect(service.runOnce()).rejects.toMatchObject({
      code: "SHADOW_PROMPT_NOT_CONFIGURED",
    } satisfies Partial<LarkTicketShadowSummaryError>);
  });

  it("continues with the next candidate after a failure", async () => {
    const first = makeTicket({ recordId: "rec-1" });
    const second = makeTicket({ recordId: "rec-2", title: "ticket record：另一个问题" });
    const { service, writes } = makeDeps({
      candidates: [first, second],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      deepSeekText: "不是 JSON",
    });

    const result = await service.runOnce();

    expect(result).toEqual({ considered: 2, summarized: 0, skipped: 0, failed: 2 });
    expect(writes).toHaveLength(2);
  });
});

describe("Shadow v2 validation and projection writes (mock provider)", () => {
  it("uses only the dedicated prompt key and keeps description in the input once", async () => {
    const { service, prompts, promptKeys, writes } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, prompt: "" });
    await service.runOnce();
    expect(promptKeys).toEqual(["lark_ticket.shadow.summarize"]);
    expect(prompts[0].match(/not able to add the promotion to this order\./g)).toHaveLength(1);
    expect(prompts[0]).toContain("# 业务风险评估");
    expect(prompts[0]).toContain("# 回复时机建议");
    expect(prompts[0]).toContain("# 处理结果与客服质量");
    expect(writes[0]).toMatchObject({ ruleVersion: "v1", contextInfo: { includedMessages: 2, truncated: false } });
  });

  it.each([
    ["高风险已回复", 7, "no_reply_needed", "已明确回应当前进展，暂无新增诉求。"],
    ["低风险承诺逾期", 2, "reply_now", "已错过反馈承诺，需说明进展。"],
    ["等待补充", null, "no_reply_needed", "已要求对方提供错误截图，影响范围未知。"],
    ["解决后重新报障", 6, "reply_now", "最新消息确认故障再次出现。"],
    ["角色未知", null, "undetermined", "无法确认谁是处理方。"],
    ["有明确时限", 3, "reply_by_deadline", "已承诺明天反馈。"],
    ["常规跟进", 3, "normal_follow_up", "存在待回应事项，无立即回复依据。"],
  ])("preserves independent risk/reply conclusions for %s without deriving them from confidence", async (_name, level, advice, rationale) => {
    for (const confidence of [0.1, 0.95]) {
      const output = JSON.parse(validAnalysisJson(["M1", "M1"]));
      output.analysis.intent.confidence = confidence;
      output.analysis.result.confidence = confidence;
      output.analysis.businessRisk = { level, rationale, evidenceMessageIds: ["M2", "M2"] };
      output.analysis.replyAdvice = { advice, rationale, evidenceMessageIds: ["M1", "M2"] };
      const { service, writes } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, deepSeekText: JSON.stringify(output) });
      expect(await service.runOnce()).toMatchObject({ summarized: 1 });
      expect(writes[0]).toMatchObject({ analysis: { analysis: {
        intent: { evidenceMessageIds: ["om_1"] },
        businessRisk: { level, rationale, evidenceMessageIds: ["om_2"] },
        replyAdvice: { advice, rationale, evidenceMessageIds: ["om_1", "om_2"] },
      } } });
    }
  });

  it.each(["intent", "businessRisk", "replyAdvice"])("rejects omitted-message evidence in %s even when the full snapshot contains it", async (section) => {
    const snapshot = makeSnapshot();
    snapshot.preparedMessages[0].text = "oversized ".repeat(7000);
    const output = JSON.parse(validAnalysisJson([]));
    output.analysis[section].evidenceMessageIds = ["M1"];
    const { service, writes, prompts } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot }, deepSeekText: JSON.stringify(output) });
    expect(await service.runOnce()).toMatchObject({ failed: 1 });
    expect(prompts[0]).not.toContain("oversized");
    expect(writes[0]).toMatchObject({ error: { errorCode: "SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT" } });
  });

  it.each(["E1", "om_1", "M999"])("rejects non-input evidence %s without logging the raw reference", async (id) => {
    const output = JSON.parse(validAnalysisJson());
    output.analysis.replyAdvice.evidenceMessageIds = [id];
    const { service, writes } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, deepSeekText: JSON.stringify(output) });
    expect(await service.runOnce()).toMatchObject({ failed: 1 });
    expect(writes[0]).toMatchObject({ error: { errorCode: "SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT" } });
    expect(JSON.stringify(writes[0])).not.toContain(id);
  });

  it.each([
    ["missing", undefined], ["type", "private-provider-value"], ["type", null], ["range", 2],
  ])("diagnoses confidence %s without retaining provider content", async (reason, confidence) => {
    const output = JSON.parse(validAnalysisJson());
    output.analysis.result.confidence = confidence;
    const { service, writes } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, deepSeekText: JSON.stringify(output) });
    expect(await service.runOnce()).toMatchObject({ failed: 1 });
    expect(writes[0]).toMatchObject({ error: { schemaIssues: [{ path: "analysis.result.confidence", reason }] } });
    expect(JSON.stringify(writes)).not.toContain("private-provider-value");
  });

  it("rejects a subtype belonging to a different parent intent", async () => {
    const output = JSON.parse(validAnalysisJson());
    output.analysis.intent.intentSubtype = "grant_permission";
    const { service, writes } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, deepSeekText: JSON.stringify(output) });
    expect(await service.runOnce()).toMatchObject({ failed: 1 });
    expect(writes[0]).toMatchObject({ error: { schemaIssues: [{ path: "analysis.intent.intentSubtype", reason: "custom" }] } });
  });

  it.each([0, 10, 1.5, "6"])("rejects invalid business risk level %s", async (level) => {
    const output = JSON.parse(validAnalysisJson());
    output.analysis.businessRisk.level = level;
    const { service } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, deepSeekText: JSON.stringify(output) });
    expect(await service.runOnce()).toMatchObject({ failed: 1 });
  });

  it("does not include malformed JSON text in errors", async () => {
    const { service, writes } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, deepSeekText: '{"secret":"sensitive-value",INVALID}' });
    await service.runOnce();
    expect(JSON.stringify(writes)).not.toContain("sensitive-value");
    expect(writes[0]).toMatchObject({ error: { errorMessage: "Shadow Ticket summary output JSON parse failed." } });
  });
});

describe("Shadow Wiki retrieval", () => {
  const historicalWiki: WikiKnowledgeEvidence = {
    sourceId: 1, title: "Report workflow", path: "concepts/report.md", status: "draft", environments: ["UK Odoo 17"],
    content: "Report workflow: check report configuration.",
    sourceEvidence: [{ id: "old-source", path: "raw/transcripts/ticket-old.md", content: "Historical user: report still fails after retry.", complete: true }],
    applicability: "historical_reference", limitations: ["处理前提未核实"],
  };

  it("passes ranked Wiki excerpts and limitations to the final analysis without mixing Wiki and thread IDs", async () => {
    const retrieve = vi.fn().mockResolvedValue({ question: "report", evidence: [historicalWiki] });
    const output = JSON.parse(validAnalysisJson());
    output.analysis.result.solutionSummary = "建议核对配置，仅为历史参考。[W1]";
    const { service, writes, prompts, actionRunIds } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, wikiQaService: { retrieve }, deepSeekText: JSON.stringify(output) });
    expect(await service.runOnce()).toMatchObject({ summarized: 1 });
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve.mock.calls[0][0]).toMatchObject({ actionRunId: actionRunIds[0], ticketContext: expect.stringContaining("M1") });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Historical user: report still fails after retry.");
    expect(prompts[0]).toContain("处理前提未核实");
    expect(prompts[0]).toContain('"reference":"W1"');
    expect(prompts[0]).toContain("不得用历史损失抬高本 Ticket 风险");
    expect(writes[0]).toMatchObject({ wikiContext: { status: "matched", sources: [{ sourceId: 1, path: historicalWiki.path }] }, wikiEvidence: [historicalWiki], analysis: { analysis: { intent: { evidenceMessageIds: ["om_1"] } } } });
  });

  it("distinguishes a successful empty retrieval from an unavailable Wiki", async () => {
    const { service, writes, prompts } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() } });
    expect(await service.runOnce()).toMatchObject({ summarized: 1 });
    expect(writes[0]).toMatchObject({ wikiContext: { status: "no_matches", sources: [] }, wikiEvidence: [] });
    expect(prompts[0]).toContain('"status":"no_matches"');
  });

  it.each(["extract", "retrieve", "rerank", "evidence"])("continues chat-only analysis when Wiki %s fails, without exposing raw errors", async (phase) => {
    const retrieve = vi.fn().mockRejectedValue(new WikiQaError("WIKI_QA_MODEL_FAILED", "private error", { layer: "server", module: "wiki-qa", stage: `server.wiki_qa.${phase}` }));
    const { service, writes, prompts } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, wikiQaService: { retrieve } });
    expect(await service.runOnce()).toMatchObject({ summarized: 1, failed: 0 });
    expect(writes[0]).toMatchObject({ wikiContext: { status: "unavailable", errorCode: "WIKI_QA_MODEL_FAILED", sources: [] } });
    expect(prompts[0]).toContain('"status":"unavailable"');
    expect(JSON.stringify(writes)).not.toContain("private error");
  });

  it("degrades unexpected retrieval errors safely and retains the final model's failure semantics", async () => {
    const retrieve = vi.fn().mockRejectedValue(new Error("sensitive provider data"));
    const { service, writes } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, wikiQaService: { retrieve }, deepSeekText: "bad final output" });
    expect(await service.runOnce()).toMatchObject({ summarized: 0, failed: 1 });
    expect(writes[0]).toMatchObject({ error: { errorCode: "SHADOW_OUTPUT_INVALID" } });
    expect(JSON.stringify(writes)).not.toContain("sensitive provider data");
  });

  it.each(["[W2]", "[W0]", "[W1,2]"])("rejects invalid final Wiki citation %s", async (reference) => {
    const output = JSON.parse(validAnalysisJson());
    output.analysis.businessRisk.rationale = `依据 ${reference}`;
    const { service, writes } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() },
      wikiQaService: { retrieve: async () => ({ question: "report", evidence: [historicalWiki] }) }, deepSeekText: JSON.stringify(output) });
    expect(await service.runOnce()).toMatchObject({ failed: 1 });
    expect(writes[0]).toMatchObject({ error: { errorCode: "SHADOW_WIKI_REFERENCE_INVALID" } });
  });

  it("rejects W references when no sources were supplied, including degraded runs", async () => {
    const output = JSON.parse(validAnalysisJson());
    output.summary = "历史参考。[W1]";
    const { service, writes } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() },
      wikiQaService: { retrieve: async () => { throw new Error("offline"); } }, deepSeekText: JSON.stringify(output) });
    expect(await service.runOnce()).toMatchObject({ failed: 1 });
    expect(writes[0]).toMatchObject({ error: { errorCode: "SHADOW_WIKI_REFERENCE_INVALID" } });
  });

  it("never accepts Wiki references as current Ticket message evidence", async () => {
    const { service, writes } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() },
      wikiQaService: { retrieve: async () => ({ question: "report", evidence: [historicalWiki] }) }, deepSeekText: validAnalysisJson(["W1"]) });
    expect(await service.runOnce()).toMatchObject({ failed: 1 });
    expect(writes[0]).toMatchObject({ error: { errorCode: "SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT" } });
  });

  it("reuses the real Wiki retrieval pipeline with 20 candidates, Top5 and final3 without generating a Wiki answer (mock adapters)", async () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      ...historicalWiki, id: `wiki-${index + 1}`, path: `concepts/report-${index + 1}.md`, historicalOnly: false,
      sourceEvidence: [{ id: `source-${index + 1}`, path: `raw/transcripts/ticket-${index + 1}.md`, content: "Report workflow still fails after retry.", complete: true }],
    }));
    const reader = { search: vi.fn().mockResolvedValue(candidates) };
    const extractClient = { createJsonCompletion: vi.fn().mockResolvedValue({ content: JSON.stringify({ question: "report workflow", keywords: ["report"], objects: [], environments: ["UK Odoo 17"] }), model: "extract" }) };
    const rerankClient = { rerank: vi.fn().mockResolvedValue({ mode: "general", content: JSON.stringify({ matches: candidates.slice(0, 5).map((candidate) => ({ candidateId: candidate.id, applicability: "applicable", conditionsMatched: false, evidenceIds: candidate.sourceEvidence.map((source) => source.id), limitations: [] })) }), model: "rank" }) };
    const wiki = createWikiQaService({ reader, client: extractClient, rerankClient, promptStore: { getByKey: async () => undefined }, extractLog: vi.fn(), answerLog: vi.fn() });
    const output = JSON.parse(validAnalysisJson());
    output.summary = "可参考历史配置检查。[W1][W3]";
    const { service, writes, actionRunIds, prompts } = makeDeps({ candidates: [makeTicket()], threadResult: { source: "lark", snapshot: makeSnapshot() }, wikiQaService: wiki, deepSeekText: JSON.stringify(output) });
    expect(await service.runOnce()).toMatchObject({ summarized: 1 });
    expect(extractClient.createJsonCompletion).toHaveBeenCalledTimes(1);
    expect(rerankClient.rerank).toHaveBeenCalledTimes(1);
    expect(rerankClient.rerank.mock.calls[0][0]).toMatchObject({ topN: 5, actionRunId: actionRunIds[0] });
    expect(rerankClient.rerank.mock.calls[0][0].documents).toHaveLength(20);
    expect((writes[0].wikiContext as { sources: unknown[] }).sources).toHaveLength(3);
    expect(prompts[0]).toContain('"reference":"W3"');
    expect(prompts[0]).not.toContain('"reference":"W4"');
    expect(extractClient.createJsonCompletion.mock.calls[0][0].actionRunId).toBe(actionRunIds[0]);
  });
});
