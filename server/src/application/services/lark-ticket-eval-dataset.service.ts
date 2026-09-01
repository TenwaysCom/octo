import { createHash } from "node:crypto";
import { PostgresPlatformSyncStore, type PlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { PostgresLarkTicketThreadSyncStore, type LarkTicketThreadSyncStore } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import { PostgresLarkTicketEvalSampleStore, type LarkTicketEvalSampleStore } from "../../adapters/postgres/lark-ticket-eval-sample-store.js";
import type { LarkTicketEvalSampleUpdate } from "../../domain/lark-ticket-eval-sample.js";

export class LarkTicketEvalDatasetError extends Error {
  constructor(readonly code: "LARK_TICKET_NOT_FOUND" | "TICKET_AI_OUTPUT_NOT_FOUND" | "THREAD_SNAPSHOT_NOT_FOUND" | "THREAD_SNAPSHOT_INCOMPLETE" | "EVAL_SAMPLE_NOT_FOUND", message: string, readonly actionRunId: string) { super(message); this.name = "LarkTicketEvalDatasetError"; }
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
    list: () => sampleStore.list(),
    async create(input: { ticket: { baseId: string; tableId: string; recordId: string }; actionRunId: string }) {
      const [ticket] = await syncStore.getLarkBaseTicketsForCleaning([input.ticket]);
      if (!ticket) throw new LarkTicketEvalDatasetError("LARK_TICKET_NOT_FOUND", "The requested Lark Ticket is not available in the synchronized snapshot.", input.actionRunId);
      if (!Object.keys(ticket.ticketAi?.fields ?? {}).length) throw new LarkTicketEvalDatasetError("TICKET_AI_OUTPUT_NOT_FOUND", "Generate Ticket AI output before creating an Eval sample.", input.actionRunId);
      const snapshot = await threadStore.get(input.ticket);
      if (!snapshot) throw new LarkTicketEvalDatasetError("THREAD_SNAPSHOT_NOT_FOUND", "Create an AI context snapshot before creating an Eval sample.", input.actionRunId);
      if (!snapshot.historyComplete) throw new LarkTicketEvalDatasetError("THREAD_SNAPSHOT_INCOMPLETE", "The Ticket thread snapshot is incomplete and cannot be used as an Eval sample.", input.actionRunId);
      const existing = await sampleStore.findByTicketSnapshot(input.ticket, snapshot.snapshotVersion);
      if (existing) return existing;
      const timestamp = now();
      const id = `ticket-eval-${digest(`${input.ticket.baseId}:${input.ticket.tableId}:${input.ticket.recordId}:${snapshot.snapshotVersion}`)}`;
      return sampleStore.create({ id, ticket: { ...input.ticket, title: ticket.title }, snapshotVersion: snapshot.snapshotVersion,
        aiOutput: ticket.ticketAi?.fields ?? {}, datasetStatus: "draft", failureLabels: [], createdAt: timestamp, updatedAt: timestamp });
    },
    async update(input: { id: string; update: LarkTicketEvalSampleUpdate }) {
      const sample = await sampleStore.update(input.id, input.update, now());
      if (!sample) throw new LarkTicketEvalDatasetError("EVAL_SAMPLE_NOT_FOUND", "The Eval sample no longer exists.", input.update.actionRunId);
      return sample;
    },
  };
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 24); }
