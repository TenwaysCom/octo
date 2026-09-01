import { describe, expect, it, vi } from "vitest";
import { createLarkTicketEvalDatasetService } from "./lark-ticket-eval-dataset.service.js";

const ticket = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };
const sample = { id: "sample_1", ticket: { ...ticket, title: "登录失败" }, snapshotVersion: 3, aiOutput: { "AI Ticket 总结": "登录失败" }, datasetStatus: "draft" as const, failureLabels: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };

describe("LarkTicketEvalDatasetService", () => {
  it("freezes an AI output against a complete Ticket snapshot and is idempotent", async () => {
    const sampleStore = { list: vi.fn(), findByTicketSnapshot: vi.fn().mockResolvedValue(undefined), create: vi.fn().mockResolvedValue(sample), update: vi.fn() };
    const service = createLarkTicketEvalDatasetService({
      syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([
        { ...ticket, title: "登录失败", ticketAi: { fields: { "AI Ticket 总结": "登录失败" } } },
      ]) },
      threadStore: { get: vi.fn().mockResolvedValue({ snapshotVersion: 3, historyComplete: true }) }, sampleStore: sampleStore as never, now: () => sample.createdAt,
    });
    await expect(service.create({ ticket, actionRunId: "run_1" })).resolves.toEqual(sample);
    expect(sampleStore.create).toHaveBeenCalledWith(expect.objectContaining({ snapshotVersion: 3, aiOutput: { "AI Ticket 总结": "登录失败" }, datasetStatus: "draft" }));
  });

  it("does not create a reusable Eval sample from an incomplete snapshot", async () => {
    const service = createLarkTicketEvalDatasetService({
      syncStore: { getLarkBaseTicketsForCleaning: vi.fn().mockResolvedValue([{ ...ticket, title: "登录失败", ticketAi: { fields: { "AI分析状态": "已生成" } } }]) },
      threadStore: { get: vi.fn().mockResolvedValue({ snapshotVersion: 3, historyComplete: false }) },
      sampleStore: { list: vi.fn(), findByTicketSnapshot: vi.fn(), create: vi.fn(), update: vi.fn() } as never,
    });
    await expect(service.create({ ticket, actionRunId: "run_1" })).rejects.toMatchObject({ code: "THREAD_SNAPSHOT_INCOMPLETE" });
  });
});
