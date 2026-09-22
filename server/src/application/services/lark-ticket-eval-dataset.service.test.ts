import { createLarkTicketEvalDatasetService } from "./lark-ticket-eval-dataset.service.js";

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
