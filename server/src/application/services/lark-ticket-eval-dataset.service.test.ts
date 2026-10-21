import { createLarkTicketEvalDatasetService } from "./lark-ticket-eval-dataset.service.js";
import { shadowEvalVersion } from "../../domain/shadow-eval-version.js";

it("freezes only the viewed Shadow result, saves initial Badcase atomically, and rejects changed output", async () => {
  const shadow = { status: "ok" as const, snapshotVersion: 3, analyzedAt: "2026-10-21T00:00:00Z", intent: "咨询", summary: "问题", solutionSummary: "方案" };
  const stores = {
    syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ baseId: "b", tableId: "t", recordId: "r", title: "Title", shadowAi: shadow, ticketAi: { fields: { "AI意图": "不应混入" } } }]) },
    threadStore: { get: vi.fn().mockResolvedValue({ snapshotVersion: 3, historyComplete: true }) },
    sampleStore: { get: vi.fn(), hasReview: vi.fn(), create: vi.fn().mockImplementation(async (value) => value) },
  };
  const service = createLarkTicketEvalDatasetService({ syncStore: stores.syncStore as never, threadStore: stores.threadStore as never, sampleStore: stores.sampleStore as never,
    shadowTransaction: (async (_ref: unknown, work: (deps: unknown) => unknown) => work(stores)) as never });
  const input = { ticket: { baseId: "b", tableId: "t", recordId: "r" }, reviewer: { id: "alice", name: "Alice" },
    request: { baseId: "b", tableId: "t", outputVersion: shadowEvalVersion(shadow), actionRunId: "save", datasetStatus: "badcase" as const, failureLabels: ["fact_incorrect" as const], notes: "方案环境错误" } };
  expect(await service.createShadow(input)).toMatchObject({ source: "shadow", aiOutput: { shadowAi: shadow }, datasetStatus: "badcase", notes: "方案环境错误" });
  expect(stores.sampleStore.create).toHaveBeenCalledTimes(1);
  stores.sampleStore.create.mockClear();
  await expect(service.createShadow({ ...input, request: { ...input.request, outputVersion: "a".repeat(64) } })).rejects.toMatchObject({ code: "SHADOW_OUTPUT_CHANGED" });
  expect(stores.sampleStore.create).not.toHaveBeenCalled();
  stores.sampleStore.get.mockResolvedValue({ id: "existing", notes: "后来保存的内容" });
  stores.sampleStore.hasReview.mockResolvedValue(true);
  expect(await service.createShadow(input)).toMatchObject({ notes: "后来保存的内容" });
});

it.each([
  { name: "no result", shadow: undefined, snapshot: { snapshotVersion: 3, historyComplete: true }, code: "SHADOW_OUTPUT_UNAVAILABLE" },
  { name: "failed result", shadow: { status: "error", snapshotVersion: 3 }, snapshot: { snapshotVersion: 3, historyComplete: true }, code: "SHADOW_OUTPUT_UNAVAILABLE" },
  { name: "skipped result", shadow: { status: "skipped", snapshotVersion: 3 }, snapshot: { snapshotVersion: 3, historyComplete: true }, code: "SHADOW_OUTPUT_UNAVAILABLE" },
  { name: "missing thread", shadow: { status: "ok", snapshotVersion: 3 }, snapshot: undefined, code: "THREAD_SNAPSHOT_NOT_FOUND" },
  { name: "changed thread", shadow: { status: "ok", snapshotVersion: 3 }, snapshot: { snapshotVersion: 4, historyComplete: true }, code: "SHADOW_OUTPUT_CHANGED" },
  { name: "incomplete material", shadow: { status: "ok", snapshotVersion: 3 }, snapshot: { snapshotVersion: 3, historyComplete: false }, code: "THREAD_SNAPSHOT_INCOMPLETE" },
])("rejects $name without creating a Shadow sample", async ({ shadow, snapshot, code }) => {
  const syncStore = { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ title: "Title", shadowAi: shadow }]) };
  const threadStore = { get: vi.fn().mockResolvedValue(snapshot) };
  const sampleStore = { get: vi.fn(), create: vi.fn() };
  const deps = { syncStore, threadStore, sampleStore };
  const service = createLarkTicketEvalDatasetService({ syncStore, threadStore, sampleStore: sampleStore as never,
    shadowTransaction: (async (_ref: unknown, work: (value: unknown) => unknown) => work(deps)) as never });
  await expect(service.createShadow({ ticket: { baseId: "b", tableId: "t", recordId: "r" }, reviewer: { id: "a", name: "A" },
    request: { baseId: "b", tableId: "t", outputVersion: shadowEvalVersion(shadow ?? {}), actionRunId: "run", datasetStatus: "eval", failureLabels: [] } }))
    .rejects.toMatchObject({ code });
  expect(sampleStore.create).not.toHaveBeenCalled();
});

const ticket = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };
const sample = { id: "sample_1", ticket: { ...ticket, title: "登录失败" }, snapshotVersion: 3, aiOutput: { "AI Ticket 总结": "登录失败" }, datasetStatus: "eval" as const, failureLabels: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };

describe("LarkTicketEvalDatasetService", () => {
  it("freezes an AI output against a complete Ticket snapshot and is idempotent", async () => {
    const sampleStore = { list: vi.fn(), findByTicketSnapshot: vi.fn().mockResolvedValue(undefined), create: vi.fn().mockResolvedValue(sample), update: vi.fn() };
    const service = createLarkTicketEvalDatasetService({
      syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([
        { ...ticket, title: "登录失败", ticketAi: { fields: { "AI Ticket 总结": "登录失败" } } },
      ]) },
      threadStore: { get: vi.fn().mockResolvedValue({ snapshotVersion: 3, historyComplete: true }) }, sampleStore: sampleStore as never, now: () => sample.createdAt,
    });
    await expect(service.create({ ticket, actionRunId: "run_1", reviewer: { id: "user_1", name: "Alice" } })).resolves.toEqual(sample);
    expect(sampleStore.create).toHaveBeenCalledWith(expect.objectContaining({ snapshotVersion: 3, aiOutput: { "AI Ticket 总结": "登录失败" }, datasetStatus: "eval" }), { id: "user_1", name: "Alice" }, "run_1");
  });

  it("rejects an incomplete snapshot without the required summaries", async () => {
    const service = createLarkTicketEvalDatasetService({
      syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "登录失败", ticketAi: { fields: { "AI分析状态": "已生成" } } }]) },
      threadStore: { get: vi.fn().mockResolvedValue({ snapshotVersion: 3, historyComplete: false }) },
      sampleStore: { list: vi.fn(), findByTicketSnapshot: vi.fn(), create: vi.fn(), update: vi.fn() } as never,
    });
    await expect(service.create({ ticket, actionRunId: "run_1", reviewer: { id: "user_1", name: "Alice" } })).rejects.toMatchObject({ code: "THREAD_SNAPSHOT_INCOMPLETE" });
  });

  it("allows a complete Ticket snapshot to enter the dataset before AI output is available", async () => {
    const sampleStore = { list: vi.fn(), findByTicketSnapshot: vi.fn().mockResolvedValue(undefined), create: vi.fn().mockResolvedValue(sample), update: vi.fn() };
    const service = createLarkTicketEvalDatasetService({
      syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "登录失败" }]) },
      threadStore: { get: vi.fn().mockResolvedValue({ snapshotVersion: 3, historyComplete: true }) }, sampleStore: sampleStore as never, now: () => sample.createdAt,
    });
    await expect(service.create({ ticket, actionRunId: "run_1", reviewer: { id: "user_1", name: "Alice" } })).resolves.toEqual(sample);
    expect(sampleStore.create).toHaveBeenCalledWith(expect.objectContaining({ aiOutput: {} }), { id: "user_1", name: "Alice" }, "run_1");
  });
});

it("returns an existing snapshot without changing another reviewer's state", async () => {
  const existing = { ...sample, datasetStatus: "draft", evalBy: "Bob", evalAt: sample.createdAt };
  const sampleStore = { list: vi.fn(), findByTicketSnapshot: vi.fn().mockResolvedValue(existing), create: vi.fn(), update: vi.fn() };
  const service = createLarkTicketEvalDatasetService({
    syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "Example" }]) },
    threadStore: { get: vi.fn().mockResolvedValue({ snapshotVersion: 3, historyComplete: true }) }, sampleStore: sampleStore as never,
  });
  expect(await service.create({ ticket, actionRunId: "retry", reviewer: { id: "alice", name: "Alice" } })).toEqual(existing);
  expect(sampleStore.create).not.toHaveBeenCalled();
  expect(sampleStore.update).not.toHaveBeenCalled();
});

const summaries = { "AI意图": "咨询", "AI Ticket 总结": "无法登录", "AI回答总结": "重置密码" };

it.each([
  { name: "formal summaries", ticketAi: { fields: summaries } },
  { name: "successful Shadow summaries", shadowAi: { status: "ok", intent: "咨询", summary: "无法登录", solutionSummary: "重置密码" } },
  { name: "formal summaries before Shadow", ticketAi: { fields: summaries }, shadowAi: { status: "ok", intent: "其他", summary: "其他", solutionSummary: "其他" } },
  { name: "mixed formal and Shadow summaries", ticketAi: { fields: { "AI意图": "咨询" } }, shadowAi: { status: "ok", summary: "无法登录", solutionSummary: "重置密码" } },
])("admits an incomplete snapshot with $name and freezes its summaries", async (outputs) => {
  const sampleStore = { list: vi.fn(), findByTicketSnapshot: vi.fn(), create: vi.fn().mockResolvedValue(sample), update: vi.fn() };
  const service = createLarkTicketEvalDatasetService({
    syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "登录失败", ...outputs }]) },
    threadStore: { get: vi.fn().mockResolvedValue({ snapshotVersion: 3, historyComplete: false }) },
    sampleStore: sampleStore as never,
  });
  await expect(service.create({ ticket, actionRunId: "partial", reviewer: { id: "alice", name: "Alice" } })).resolves.toEqual(sample);
  expect(sampleStore.create).toHaveBeenCalledWith(expect.objectContaining({ snapshotVersion: 3, datasetStatus: "eval", aiOutput: summaries }), { id: "alice", name: "Alice" }, "partial");
});

it.each(Object.keys(summaries))("rejects partial snapshots missing %s even with unsuccessful Shadow output", async (missing) => {
  const sampleStore = { list: vi.fn(), findByTicketSnapshot: vi.fn(), create: vi.fn(), update: vi.fn() };
  const service = createLarkTicketEvalDatasetService({
    syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "登录失败", ticketAi: { fields: { ...summaries, [missing]: "  " } }, shadowAi: { status: "error", intent: "咨询", summary: "无法登录", solutionSummary: "重置密码" } }]) },
    threadStore: { get: vi.fn().mockResolvedValue({ snapshotVersion: 3, historyComplete: false }) }, sampleStore: sampleStore as never,
  });
  await expect(service.create({ ticket, actionRunId: "partial", reviewer: { id: "alice", name: "Alice" } })).rejects.toMatchObject({ code: "THREAD_SNAPSHOT_INCOMPLETE" });
  expect(sampleStore.create).not.toHaveBeenCalled();
});

it("still requires a snapshot when all summaries are available", async () => {
  const sampleStore = { list: vi.fn(), findByTicketSnapshot: vi.fn(), create: vi.fn(), update: vi.fn() };
  const service = createLarkTicketEvalDatasetService({
    syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, ticketAi: { fields: summaries } }]) },
    threadStore: { get: vi.fn().mockResolvedValue(undefined) }, sampleStore: sampleStore as never,
  });
  await expect(service.create({ ticket, actionRunId: "missing", reviewer: { id: "alice", name: "Alice" } })).rejects.toMatchObject({ code: "THREAD_SNAPSHOT_NOT_FOUND" });
  expect(sampleStore.create).not.toHaveBeenCalled();
});
