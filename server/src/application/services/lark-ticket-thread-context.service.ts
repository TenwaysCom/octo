import type {
  LarkThreadMessage as LarkApiThreadMessage,
  ListLarkThreadMessagesOptions,
} from "../../adapters/lark/lark-client.js";
import {
  PostgresLarkTicketThreadSyncStore,
  type LarkTicketThreadMessage,
  type LarkTicketThreadSnapshot,
  type LarkTicketThreadSyncStore,
} from "../../adapters/postgres/lark-ticket-thread-sync-store.js";
import type { LarkBaseTicketSyncItem } from "../../adapters/postgres/platform-sync-store.js";
import { logger } from "../../logger.js";
import { buildAuthenticatedLarkClient } from "./lark-auth-client.factory.js";

const threadLogger = logger.child({ module: "lark-ticket-thread-context" });
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_FULL_RECONCILE_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INCREMENTAL_OVERLAP_SECONDS = 60;
const MAX_PAGES = 1_000;
const TERMINAL_STATUSES = new Set(["finish", "cancelled", "rejected"]);

type LarkThreadClient = {
  getMessage(messageId: string): Promise<LarkApiThreadMessage>;
  getThreadMessages(threadId: string, options?: ListLarkThreadMessagesOptions): Promise<{
    items: LarkApiThreadMessage[];
    hasMore: boolean;
    pageToken?: string;
  }>;
};

export type LarkTicketThreadSyncDecision = "none" | "cache" | "full" | "incremental";

export interface LarkTicketThreadContextResult {
  decision: LarkTicketThreadSyncDecision;
  source: "none" | "cache" | "lark" | "stale_cache";
  threadId?: string;
  snapshot?: LarkTicketThreadSnapshot;
}

export interface LarkTicketThreadContextServiceDeps {
  store?: LarkTicketThreadSyncStore;
  buildClient?: (masterUserId: string, baseUrl: string) => Promise<{ client: LarkThreadClient }>;
  now?: () => Date;
  maxAgeMs?: number;
  fullReconcileAgeMs?: number;
  incrementalOverlapSeconds?: number;
}

export class LarkTicketThreadContextError extends Error {
  constructor(
    readonly code: "LARK_THREAD_CONTEXT_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "LarkTicketThreadContextError";
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseLarkThreadId(messageLink: string | undefined): string | undefined {
  if (!messageLink) return undefined;
  try {
    return new URL(messageLink).searchParams.get("threadid")?.trim() || undefined;
  } catch {
    const match = messageLink.match(/[?&]threadid=([^&#\s]+)/i);
    if (!match) return undefined;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
}

export function isTerminalLarkTicketStatus(status: string | undefined): boolean {
  return TERMINAL_STATUSES.has(status?.trim().toLowerCase() ?? "");
}

function isOlderThan(value: string | undefined, nowMs: number, ageMs: number): boolean {
  if (!value) return true;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) || nowMs - parsed >= ageMs;
}

export function decideLarkTicketThreadSync(input: {
  threadId?: string;
  ticketStatus?: string;
  snapshot?: LarkTicketThreadSnapshot;
  now: Date;
  maxAgeMs: number;
  fullReconcileAgeMs: number;
}): LarkTicketThreadSyncDecision {
  if (!input.threadId) return "none";
  const snapshotMatches = input.snapshot?.threadId === input.threadId;
  const usable = snapshotMatches
    && Boolean(input.snapshot?.lastSuccessfulSyncAt)
    && input.snapshot?.historyComplete === true;
  if (isTerminalLarkTicketStatus(input.ticketStatus)) {
    return usable ? "cache" : "full";
  }
  if (!usable) return "full";
  if (input.snapshot?.frozenAt) return "incremental";
  const nowMs = input.now.getTime();
  if (isOlderThan(input.snapshot?.lastFullReconciledAt, nowMs, input.fullReconcileAgeMs)) {
    return "full";
  }
  if (!input.snapshot?.dirty && !isOlderThan(input.snapshot?.lastCheckedAt, nowMs, input.maxAgeMs)) {
    return "cache";
  }
  return "incremental";
}

function sanitizeContent(message: LarkApiThreadMessage): string | undefined {
  if (message.deleted) return undefined;
  if (message.msg_type !== "image") return message.content;
  try {
    const parsed = JSON.parse(message.content || "{}") as { image_key?: unknown };
    return typeof parsed.image_key === "string"
      ? JSON.stringify({ imageKey: parsed.image_key })
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeMessage(message: LarkApiThreadMessage): LarkTicketThreadMessage | undefined {
  if (!message.message_id) return undefined;
  return {
    messageId: message.message_id,
    rootId: message.root_id,
    parentId: message.parent_id,
    threadId: message.thread_id,
    messageType: message.msg_type,
    createdAt: message.create_time,
    updatedAt: message.update_time,
    deleted: message.deleted,
    senderId: message.sender?.id,
    senderType: message.sender?.sender_type,
    content: sanitizeContent(message),
  };
}

function sortMessages(messages: LarkTicketThreadMessage[]): LarkTicketThreadMessage[] {
  return [...messages].sort((left, right) => {
    const timeComparison = (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
    return timeComparison || left.messageId.localeCompare(right.messageId);
  });
}

function mergeMessages(
  current: LarkTicketThreadMessage[],
  incoming: LarkTicketThreadMessage[],
): LarkTicketThreadMessage[] {
  const byId = new Map(current.map((message) => [message.messageId, message]));
  for (const message of incoming) byId.set(message.messageId, message);
  return sortMessages([...byId.values()]);
}

function resolveWatermark(messages: LarkTicketThreadMessage[]): {
  watermarkCreatedAt?: string;
  watermarkMessageId?: string;
} {
  const latest = [...messages]
    .filter((message) => message.createdAt)
    .sort((left, right) => {
      const timeComparison = (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
      return timeComparison || right.messageId.localeCompare(left.messageId);
    })[0];
  return {
    watermarkCreatedAt: latest?.createdAt,
    watermarkMessageId: latest?.messageId,
  };
}

function toIncrementalStartTime(watermark: string | undefined, overlapSeconds: number): string | undefined {
  if (!watermark) return undefined;
  const parsed = Date.parse(watermark);
  if (Number.isNaN(parsed)) return undefined;
  return String(Math.max(0, Math.floor(parsed / 1000) - overlapSeconds));
}

async function listAllThreadMessages(
  client: LarkThreadClient,
  threadId: string,
  startTime?: string,
): Promise<LarkApiThreadMessage[]> {
  const messages: LarkApiThreadMessage[] = [];
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await client.getThreadMessages(threadId, {
      pageSize: 50,
      pageToken,
      startTime,
      sortType: "ByCreateTimeAsc",
    });
    messages.push(...result.items);
    if (!result.hasMore || !result.pageToken) return messages;
    if (seenTokens.has(result.pageToken)) {
      throw new Error("Lark thread pagination returned a repeated page token");
    }
    seenTokens.add(result.pageToken);
    pageToken = result.pageToken;
  }
  throw new Error(`Lark thread pagination exceeded ${MAX_PAGES} pages`);
}

export function createLarkTicketThreadContextService(
  deps: LarkTicketThreadContextServiceDeps = {},
) {
  const store = deps.store ?? new PostgresLarkTicketThreadSyncStore();
  const buildClient = deps.buildClient ?? (async (masterUserId, baseUrl) => {
    const result = await buildAuthenticatedLarkClient(masterUserId, baseUrl);
    return { client: result.client };
  });
  const now = deps.now ?? (() => new Date());
  const maxAgeMs = deps.maxAgeMs ?? readPositiveInteger(
    process.env.LARK_TICKET_THREAD_CONTEXT_MAX_AGE_MS,
    DEFAULT_MAX_AGE_MS,
  );
  const fullReconcileAgeMs = deps.fullReconcileAgeMs ?? readPositiveInteger(
    process.env.LARK_TICKET_THREAD_CONTEXT_FULL_RECONCILE_AGE_MS,
    DEFAULT_FULL_RECONCILE_AGE_MS,
  );
  const overlapSeconds = deps.incrementalOverlapSeconds ?? readPositiveInteger(
    process.env.LARK_TICKET_THREAD_CONTEXT_INCREMENTAL_OVERLAP_SECONDS,
    DEFAULT_INCREMENTAL_OVERLAP_SECONDS,
  );
  const inFlight = new Map<string, Promise<LarkTicketThreadContextResult>>();

  async function runEnsure(input: {
    masterUserId: string;
    larkBaseUrl: string;
    ticket: LarkBaseTicketSyncItem;
  }): Promise<LarkTicketThreadContextResult> {
    const ref = {
      baseId: input.ticket.baseId,
      tableId: input.ticket.tableId,
      recordId: input.ticket.recordId,
    };
    const threadId = parseLarkThreadId(input.ticket.larkMessageLink);
    if (!threadId) return { decision: "none", source: "none" };
    const current = await store.get(ref);
    const checkedAt = now();
    const decision = decideLarkTicketThreadSync({
      threadId,
      ticketStatus: input.ticket.ticketStatus,
      snapshot: current,
      now: checkedAt,
      maxAgeMs,
      fullReconcileAgeMs,
    });
    if (decision === "cache") {
      if (isTerminalLarkTicketStatus(input.ticket.ticketStatus) && current && !current.frozenAt) {
        const frozen = await store.markFrozen(ref, input.ticket.ticketStatus!, checkedAt.toISOString());
        return { decision, source: "cache", threadId, snapshot: frozen ?? current };
      }
      return { decision, source: "cache", threadId, snapshot: current };
    }

    try {
      const { client } = await buildClient(input.masterUserId, input.larkBaseUrl);
      const isFull = decision === "full";
      const startTime = isFull
        ? undefined
        : toIncrementalStartTime(current?.watermarkCreatedAt, overlapSeconds);
      const repliesPromise = listAllThreadMessages(client, threadId, startTime);
      const rootPromise = isFull
        ? client.getMessage(threadId).catch((error) => {
          threadLogger.warn({
            threadId,
            error: error instanceof Error ? error.message : String(error),
          }, "LARK_TICKET_THREAD_ROOT_FETCH_FAILED");
          return undefined;
        })
        : Promise.resolve(undefined);
      const [replies, root] = await Promise.all([repliesPromise, rootPromise]);
      const normalized = [...(root ? [root] : []), ...replies]
        .map(normalizeMessage)
        .filter((message): message is LarkTicketThreadMessage => Boolean(message));
      const messages = isFull
        ? mergeMessages([], normalized)
        : mergeMessages(current?.messages ?? [], normalized);
      const watermark = resolveWatermark(messages);
      const terminalStatus = isTerminalLarkTicketStatus(input.ticket.ticketStatus)
        ? input.ticket.ticketStatus
        : undefined;
      const snapshot = await store.saveSuccessfulSync({
        ...ref,
        messageLink: input.ticket.larkMessageLink!,
        threadId,
        messages,
        historyComplete: isFull ? true : current?.historyComplete ?? false,
        ...watermark,
        checkedAt: checkedAt.toISOString(),
        fullReconciledAt: isFull ? checkedAt.toISOString() : undefined,
        frozenStatus: terminalStatus,
      });
      threadLogger.info({
        baseId: ref.baseId,
        tableId: ref.tableId,
        recordId: ref.recordId,
        threadId,
        decision,
        messageCount: snapshot.messages.length,
        snapshotVersion: snapshot.snapshotVersion,
      }, "LARK_TICKET_THREAD_CONTEXT_ENSURED");
      return { decision, source: "lark", threadId, snapshot };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.markFailure(ref, message, checkedAt.toISOString());
      if (current?.historyComplete && current.threadId === threadId) {
        threadLogger.warn({ ...ref, threadId, decision, error: message }, "LARK_TICKET_THREAD_CONTEXT_STALE_CACHE_USED");
        return { decision, source: "stale_cache", threadId, snapshot: current };
      }
      throw new LarkTicketThreadContextError(
        "LARK_THREAD_CONTEXT_UNAVAILABLE",
        "Lark Ticket thread context is unavailable and no complete cached snapshot exists.",
      );
    }
  }

  return {
    ensure(input: {
      masterUserId: string;
      larkBaseUrl: string;
      ticket: LarkBaseTicketSyncItem;
    }): Promise<LarkTicketThreadContextResult> {
      const threadId = parseLarkThreadId(input.ticket.larkMessageLink);
      const key = [
        input.masterUserId,
        input.ticket.baseId,
        input.ticket.tableId,
        input.ticket.recordId,
        threadId ?? "none",
      ].join(":");
      const existing = inFlight.get(key);
      if (existing) return existing;
      const pending = runEnsure(input).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return pending;
    },
  };
}

export type LarkTicketThreadContextService = ReturnType<typeof createLarkTicketThreadContextService>;
