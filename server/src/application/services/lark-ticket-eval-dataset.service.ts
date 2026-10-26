import { createHash } from "node:crypto";
import { PostgresPlatformSyncStore, type PlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { PostgresLarkTicketThreadSyncStore, type LarkTicketThreadSyncStore } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import { PostgresLarkTicketEvalSampleStore, withShadowEvalSourceLock, type LarkTicketEvalSampleStore, type EvalReviewer, type EvalTicketRef } from "../../adapters/postgres/lark-ticket-eval-sample-store.js";
import { LarkTicketEvalDatasetError, type LarkTicketEvalSampleUpdate, createShadowEvalSampleSchema } from "../../domain/lark-ticket-eval-sample.js";
import type { z } from "zod";
import { shadowEvalVersion } from "../../domain/shadow-eval-version.js";

export { LarkTicketEvalDatasetError } from "../../domain/lark-ticket-eval-sample.js";

type EvalStores = {
  syncStore: Pick<PlatformSyncStore, "getLarkBaseTicketsForCleaning">;
  threadStore: Pick<LarkTicketThreadSyncStore, "get">;
  sampleStore: LarkTicketEvalSampleStore;
};

export function createLarkTicketEvalDatasetService(deps: {
  syncStore?: Pick<PlatformSyncStore, "getLarkBaseTicketsForCleaning">;
  threadStore?: Pick<LarkTicketThreadSyncStore, "get">;
  sampleStore?: LarkTicketEvalSampleStore;
  shadowTransaction?: <T>(ticket: EvalTicketRef, work: (stores: EvalStores) => Promise<T>) => Promise<T>;
  now?: () => string;
} = {}) {
  const syncStore = deps.syncStore ?? new PostgresPlatformSyncStore();
  const threadStore = deps.threadStore ?? new PostgresLarkTicketThreadSyncStore();
  const sampleStore = deps.sampleStore ?? new PostgresLarkTicketEvalSampleStore();
  const now = deps.now ?? (() => new Date().toISOString());
  const shadowTransaction = deps.shadowTransaction ?? (<T>(ticket: EvalTicketRef, work: (stores: EvalStores) => Promise<T>) =>
    withShadowEvalSourceLock(ticket, (db) => work({ syncStore: new PostgresPlatformSyncStore(db),
      threadStore: new PostgresLarkTicketThreadSyncStore(db), sampleStore: new PostgresLarkTicketEvalSampleStore(db) })));
  return {
    list: (reviewerId: string, mine = false, ticket?: EvalTicketRef) => ticket ? sampleStore.list(reviewerId, mine, ticket) : sampleStore.list(reviewerId, mine),
    async loadShadow(input: { ticket: EvalTicketRef; reviewerId: string; actionRunId?: string }) {
      const [ticket] = await syncStore.getLarkBaseTicketsForCleaning([input.ticket]);
      if (!ticket) throw new LarkTicketEvalDatasetError("LARK_TICKET_NOT_FOUND", "Ticket 尚未同步。", input.actionRunId ?? "");
      const shadowAi = ticket.shadowAi;
      const outputVersion = shadowAi ? shadowEvalVersion(shadowAi) : undefined;
      const id = outputVersion ? `shadow-eval-${digest(JSON.stringify([input.ticket.baseId, input.ticket.tableId, input.ticket.recordId, outputVersion]))}` : undefined;
      return { ticket: { ...input.ticket, title: ticket.title }, shadowAi, outputVersion,
        sample: id ? await sampleStore.get(id, input.reviewerId) ?? null : null };
    },
    async createShadow(input: { ticket: EvalTicketRef; request: z.infer<typeof createShadowEvalSampleSchema>; reviewer: EvalReviewer }) {
      const request = createShadowEvalSampleSchema.parse(input.request);
      const id = `shadow-eval-${digest(JSON.stringify([input.ticket.baseId, input.ticket.tableId, input.ticket.recordId, request.outputVersion]))}`;
      return shadowTransaction(input.ticket, async ({ syncStore, threadStore, sampleStore }) => {
        // A committed retry must succeed even if the output or annotations have changed since then.
        const existing = await sampleStore.get(id, input.reviewer.id);
        if (existing && await sampleStore.hasReview(id, input.reviewer.id, request.actionRunId)) return existing;
        if (existing) throw new LarkTicketEvalDatasetError("EVAL_SAMPLE_CONFLICT", "该结果已被标注，请重新读取后编辑。", request.actionRunId);
        const [ticket] = await syncStore.getLarkBaseTicketsForCleaning([input.ticket]);
        if (!ticket) throw new LarkTicketEvalDatasetError("LARK_TICKET_NOT_FOUND", "Ticket 尚未同步。", request.actionRunId);
        const shadow = ticket.shadowAi;
        if (shadow?.status !== "ok" || !Number.isSafeInteger(shadow.snapshotVersion) || shadow.snapshotVersion! < 1) {
          throw new LarkTicketEvalDatasetError("SHADOW_OUTPUT_UNAVAILABLE", "暂无可评价的成功 Shadow 分析，请重新分析后操作。", request.actionRunId);
        }
        if (shadowEvalVersion(shadow) !== request.outputVersion) {
          throw new LarkTicketEvalDatasetError("SHADOW_OUTPUT_CHANGED", "Shadow 分析已更新，请重新查看输出后保存。", request.actionRunId);
        }
        const snapshot = await threadStore.get(input.ticket);
        if (!snapshot) throw new LarkTicketEvalDatasetError("THREAD_SNAPSHOT_NOT_FOUND", "Ticket 尚未准备线程快照。", request.actionRunId);
        if (snapshot.snapshotVersion !== shadow.snapshotVersion) {
          throw new LarkTicketEvalDatasetError("SHADOW_OUTPUT_CHANGED", "线程材料已更新，请重新分析后再标注。", request.actionRunId);
        }
        if (!snapshot.historyComplete && ![shadow.intent, shadow.summary, shadow.solutionSummary].every(hasText)) {
          throw new LarkTicketEvalDatasetError("THREAD_SNAPSHOT_INCOMPLETE", "不完整快照需要意图、问题摘要及方案摘要齐全。", request.actionRunId);
        }
        const timestamp = now();
        return sampleStore.create({ id, ticket: { ...input.ticket, title: ticket.title }, snapshotVersion: shadow.snapshotVersion!,
          source: "shadow", outputVersion: request.outputVersion, aiOutput: { shadowAi: shadow },
          datasetStatus: request.datasetStatus, manualIntent: request.manualIntent ?? undefined,
          expectedOutcome: request.expectedOutcome ?? undefined, notes: request.notes ?? undefined,
          failureLabels: request.failureLabels, createdAt: timestamp, updatedAt: timestamp }, input.reviewer, request.actionRunId);
      });
    },
    async create(input: { ticket: { baseId: string; tableId: string; recordId: string }; actionRunId: string; reviewer: EvalReviewer }) {
      const [ticket] = await syncStore.getLarkBaseTicketsForCleaning([input.ticket]);
      if (!ticket) throw new LarkTicketEvalDatasetError("LARK_TICKET_NOT_FOUND", "The requested Lark Ticket is not available in the synchronized snapshot.", input.actionRunId);
      const snapshot = await threadStore.get(input.ticket);
      if (!snapshot) throw new LarkTicketEvalDatasetError("THREAD_SNAPSHOT_NOT_FOUND", "Create an AI context snapshot before creating an Eval sample.", input.actionRunId);
      const aiOutput = { ...ticket.ticketAi?.fields };
      const shadow = ticket.shadowAi?.status === "ok" ? ticket.shadowAi : undefined;
      const intent = [aiOutput["AI意图"], aiOutput["AI Bug 分类"], shadow?.intent].find(hasText);
      const summary = [aiOutput["AI Ticket 总结"], shadow?.summary].find(hasText);
      const answer = [aiOutput["AI回答总结"], shadow?.solutionSummary].find(hasText);
      if (!snapshot.historyComplete && !(intent && summary && answer)) {
        throw new LarkTicketEvalDatasetError("THREAD_SNAPSHOT_INCOMPLETE", "An incomplete snapshot requires intent, problem summary and solution summary to create an Eval sample.", input.actionRunId);
      }
      // Freeze the Shadow summaries used to admit a partial snapshot as well.
      if (!snapshot.historyComplete) {
        if (!hasText(aiOutput["AI意图"]) && !hasText(aiOutput["AI Bug 分类"])) aiOutput["AI意图"] = intent;
        if (!hasText(aiOutput["AI Ticket 总结"])) aiOutput["AI Ticket 总结"] = summary;
        if (!hasText(aiOutput["AI回答总结"])) aiOutput["AI回答总结"] = answer;
      }
      const existing = await sampleStore.findByTicketSnapshot(input.ticket, snapshot.snapshotVersion, input.reviewer.id);
      if (existing) return existing;
      const timestamp = now();
      const id = `ticket-eval-${digest(`${input.ticket.baseId}:${input.ticket.tableId}:${input.ticket.recordId}:${snapshot.snapshotVersion}`)}`;
      return sampleStore.create({ id, ticket: { ...input.ticket, title: ticket.title }, snapshotVersion: snapshot.snapshotVersion,
        aiOutput, datasetStatus: "eval", failureLabels: [], createdAt: timestamp, updatedAt: timestamp }, input.reviewer, input.actionRunId);
    },
    async update(input: { id: string; update: LarkTicketEvalSampleUpdate; reviewer: EvalReviewer }) {
      const sample = await sampleStore.update(input.id, input.update, now(), input.reviewer);
      if (!sample) throw new LarkTicketEvalDatasetError("EVAL_SAMPLE_NOT_FOUND", "The Eval sample no longer exists.", input.update.actionRunId);
      return sample;
    },
  };
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 24); }

function hasText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
