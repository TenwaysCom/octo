import type { LarkBaseTicketSyncItem } from "../../adapters/postgres/platform-sync-store.js";
import type { LarkTicketThreadSnapshot } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import { DeepSeekChatError } from "../../adapters/deepseek/deepseek-chat-client.js";
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

function validAnalysisJson(evidenceMessageIds: string[] = ["om_1"]): string {
  return JSON.stringify({
    version: "support-analysis-result-v1",
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
}) {
  const writes: Array<Record<string, unknown>> = [];
  const prompts: string[] = [];
  const actionRunIds: string[] = [];
  const service = createLarkTicketShadowSummaryService({
    masterUserId: "master-1",
    larkBaseUrl: "https://open.feishu.cn",
    now: () => new Date("2026-09-03T05:00:00.000Z"),
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
    deepSeekClient: {
      createJsonCompletion: async ({ prompt, actionRunId }) => {
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
      getByKey: async (key: string) => input.prompt === undefined
        ? { key, prompt: PROMPT_TEMPLATE, note: null, createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" }
        : input.prompt
          ? { key, prompt: input.prompt, note: null, createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" }
          : undefined,
    },
    promptKey: input.promptKey,
  });
  return { service, writes, prompts, actionRunIds };
}

describe("lark-ticket-shadow-summary.service", () => {
  it("summarizes a candidate and writes the ok shadow payload", async () => {
    const { service, writes, prompts, actionRunIds } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
    });

    const result = await service.runOnce();

    expect(result).toEqual({ considered: 1, summarized: 1, skipped: 0, failed: 0 });
    expect(writes).toHaveLength(1);
    const shadow = writes[0] as { status: string; analysis: { analysis: { intent: { intentType: string } } }; snapshotVersion: number; promptVersion: string };
    expect(shadow.status).toBe("ok");
    expect(shadow.analysis.analysis.intent.intentType).toBe("troubleshoot");
    expect(shadow.snapshotVersion).toBe(7);
    expect(shadow.promptVersion).toBe("v4");
    expect(prompts[0]).toContain("订单无法添加促销");
    expect(prompts[0]).toContain("om_1");
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
    const shadow = writes[0] as { status: string; error: { errorCode: string; errorMessage: string; outputChars: number; outputPreview?: string } };
    expect(shadow.status).toBe("error");
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
    expect(shadow.error.errorMessage).toBe("Shadow DeepSeek output did not contain a JSON object.");
    expect(shadow.error.outputChars).toBe(3);
  });

  it("writes an error shadow when the DeepSeek output fails schema validation", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      deepSeekText: JSON.stringify({ version: "support-analysis-result-v1", analysis: { intent: { intentType: "feature_request" } } }),
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
