import { createHash } from "node:crypto";
import { PostgresPlatformSyncStore, type PlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { PostgresLarkTicketThreadSyncStore, type LarkTicketThreadSyncStore } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import { PostgresLarkTicketEvalSampleStore, type LarkTicketEvalSampleStore, type EvalReviewer } from "../../adapters/postgres/lark-ticket-eval-sample-store.js";
import type { LarkTicketEvalSampleUpdate } from "../../domain/lark-ticket-eval-sample.js";

export class LarkTicketEvalDatasetError extends Error {
  constructor(readonly code: "LARK_TICKET_NOT_FOUND" | "THREAD_SNAPSHOT_NOT_FOUND" | "THREAD_SNAPSHOT_INCOMPLETE" | "EVAL_SAMPLE_NOT_FOUND", message: string, readonly actionRunId: string) { super(message); this.name = "LarkTicketEvalDatasetError"; }
}

export function createLarkTicketEvalDatasetService(deps: {
  syncStore?: Pick<PlatformSyncStore, "getLarkBaseTicketsForCleaning">;
  threadStore?: Pick<LarkTicketThreadSyncStore, "get">;
  sampleStore?: LarkTicketEvalSampleStore;
  now?: () => string;
} = {}) {
  const syncStore = deps.syncStore ?? new PostgresPlatformSyncStore();
  const threadStore = deps.threadStore ?? new PostgresLarkTicketThreadSyncStore();
  const sampleStore = deps.sampleStore ?? new PostgresLarkTicketEvalSampleStore();
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    list: (reviewerId: string, mine = false) => sampleStore.list(reviewerId, mine),
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
