import type { LarkBaseTicketSyncItem } from "../../adapters/postgres/platform-sync-store.js";
import type { LarkTicketThreadSnapshot } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
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
  acpText?: string;
  acpError?: Error;
  prompt?: string;
}) {
  const writes: Array<Record<string, unknown>> = [];
  const prompts: string[] = [];
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
    acpService: {
      chatOneShot: async ({ message }, emit) => {
        prompts.push(message);
        if (input.acpError) throw input.acpError;
        emit({
          event: "acp.session.update",
          data: {
            sessionId: "session-test",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: input.acpText ?? validAnalysisJson() },
            },
          },
        } as unknown as AcpKimiStreamEvent);
      },
    },
    promptStore: {
      getByKey: async (key: string) => input.prompt === undefined
        ? { key, prompt: PROMPT_TEMPLATE, note: null, createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" }
        : input.prompt
          ? { key, prompt: input.prompt, note: null, createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" }
          : undefined,
    },
  });
  return { service, writes, prompts };
}

describe("lark-ticket-shadow-summary.service", () => {
  it("summarizes a candidate and writes the ok shadow payload", async () => {
    const { service, writes, prompts } = makeDeps({
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
    expect(shadow.promptVersion).toBe("v2");
    expect(prompts[0]).toContain("订单无法添加促销");
    expect(prompts[0]).toContain("om_1");
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

  it("writes an error shadow when the ACP output is not valid JSON", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      acpText: "这不是 JSON",
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    const shadow = writes[0] as { status: string; error: { errorCode: string } };
    expect(shadow.status).toBe("error");
    expect(shadow.error.errorCode).toBe("SHADOW_OUTPUT_INVALID");
  });

  it("writes an error shadow when the ACP output fails schema validation", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      acpText: JSON.stringify({ version: "support-analysis-result-v1", analysis: { intent: { intentType: "feature_request" } } }),
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    expect((writes[0] as { error: { errorCode: string } }).error.errorCode).toBe("SHADOW_OUTPUT_INVALID");
  });

  it("rejects evidence message IDs outside the fixed snapshot", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot(["om_1"]) },
      acpText: validAnalysisJson(["om_not_in_snapshot"]),
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    expect((writes[0] as { error: { errorCode: string } }).error.errorCode).toBe("SHADOW_EVIDENCE_OUTSIDE_SNAPSHOT");
  });

  it("writes an error shadow when the ACP call fails", async () => {
    const { service, writes } = makeDeps({
      candidates: [makeTicket()],
      threadResult: { source: "lark", snapshot: makeSnapshot() },
      acpError: new Error("process exited"),
    });

    const result = await service.runOnce();

    expect(result.failed).toBe(1);
    expect((writes[0] as { error: { errorCode: string } }).error.errorCode).toBe("SHADOW_ACP_FAILED");
  });

  it("fails fast when the workflow prompt is not configured", async () => {
    const { service } = makeDeps({ prompt: "" });

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
      acpText: "不是 JSON",
    });

    const result = await service.runOnce();

    expect(result).toEqual({ considered: 2, summarized: 0, skipped: 0, failed: 2 });
    expect(writes).toHaveLength(2);
  });
});
