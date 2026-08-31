import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sql } from "kysely";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";
import { PostgresPlatformSyncStore } from "../adapters/postgres/platform-sync-store.js";
import {
  createLarkTicketThreadContextService,
  parseLarkThreadId,
} from "../application/services/lark-ticket-thread-context.service.js";

const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 5;

export interface BackfillFinishedLarkTicketThreadsArgs {
  apply: boolean;
  baseId: string;
  tableId: string;
  masterUserId?: string;
  larkBaseUrl?: string;
  concurrency: number;
  limit?: number;
}

type FinishedTicketThreadRow = {
  base_id: string;
  table_id: string;
  record_id: string;
  ticket_status: string | null;
  lark_message_link: string | null;
  snapshot_thread_id: string | null;
  history_complete: boolean | null;
};

export interface FinishedTicketThreadBackfillCandidates {
  candidates: Array<{ baseId: string; tableId: string; recordId: string }>;
  alreadyComplete: number;
  missingThreadLink: number;
  ignoredNonFinished: number;
}

function usage(): string {
  return "Usage: pnpm --dir server platform:backfill-finished-lark-ticket-threads -- --base-id <baseId> --table-id <tableId> [--limit <positiveInteger>] [--apply --master-user-id <masterUserId> --lark-base-url <https://...> --concurrency 1-5]";
}

function requireValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.\n${usage()}`);
  return value;
}

function parseConcurrency(value: string): number {
  const concurrency = Number(value);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new Error(`--concurrency must be an integer from 1 to ${MAX_CONCURRENCY}.\n${usage()}`);
  }
  return concurrency;
}

function parseLimit(value: string): number {
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(`--limit must be a positive integer.\n${usage()}`);
  }
  return limit;
}

function validateHttpsUrl(value: string): string {
  try {
    if (new URL(value).protocol !== "https:") throw new Error("not HTTPS");
    return value;
  } catch {
    throw new Error(`--lark-base-url must be an HTTPS URL.\n${usage()}`);
  }
}

export function parseArgs(argv: string[]): BackfillFinishedLarkTicketThreadsArgs {
  let apply = false;
  let baseId: string | undefined;
  let tableId: string | undefined;
  let masterUserId: string | undefined;
  let larkBaseUrl: string | undefined;
  let concurrency = DEFAULT_CONCURRENCY;
  let limit: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--base-id") {
      baseId = requireValue(argv, index, argument);
      index += 1;
    } else if (argument === "--table-id") {
      tableId = requireValue(argv, index, argument);
      index += 1;
    } else if (argument === "--master-user-id") {
      masterUserId = requireValue(argv, index, argument);
      index += 1;
    } else if (argument === "--lark-base-url") {
      larkBaseUrl = validateHttpsUrl(requireValue(argv, index, argument));
      index += 1;
    } else if (argument === "--concurrency") {
      concurrency = parseConcurrency(requireValue(argv, index, argument));
      index += 1;
    } else if (argument === "--limit") {
      limit = parseLimit(requireValue(argv, index, argument));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}.\n${usage()}`);
    }
  }

  if (!baseId || !tableId) throw new Error(`--base-id and --table-id are required.\n${usage()}`);
  if (apply && (!masterUserId || !larkBaseUrl)) {
    throw new Error(`--apply requires --master-user-id and --lark-base-url.\n${usage()}`);
  }
  return { apply, baseId, tableId, masterUserId, larkBaseUrl, concurrency, limit };
}

export function findFinishedTicketThreadBackfillCandidates(
  rows: FinishedTicketThreadRow[],
): FinishedTicketThreadBackfillCandidates {
  const result: FinishedTicketThreadBackfillCandidates = {
    candidates: [],
    alreadyComplete: 0,
    missingThreadLink: 0,
    ignoredNonFinished: 0,
  };
  for (const row of rows) {
    if (row.ticket_status?.trim().toLowerCase() !== "finish") {
      result.ignoredNonFinished += 1;
      continue;
    }
    const threadId = parseLarkThreadId(row.lark_message_link ?? undefined);
    if (!threadId) {
      result.missingThreadLink += 1;
      continue;
    }
    if (row.history_complete === true && row.snapshot_thread_id === threadId) {
      result.alreadyComplete += 1;
      continue;
    }
    result.candidates.push({
      baseId: row.base_id,
      tableId: row.table_id,
      recordId: row.record_id,
    });
  }
  return result;
}

export async function mapWithConcurrency<T, Result>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = await ensureSharedDatabase();
  try {
    const rows = await db.selectFrom("lark_base_ticket_syncs as ticket")
      .leftJoin("lark_ticket_thread_syncs as thread", (join) => join
        .onRef("thread.base_id", "=", "ticket.base_id")
        .onRef("thread.table_id", "=", "ticket.table_id")
        .onRef("thread.record_id", "=", "ticket.record_id"))
      .select([
        "ticket.base_id",
        "ticket.table_id",
        "ticket.record_id",
        "ticket.ticket_status",
        "ticket.lark_message_link",
        "thread.thread_id as snapshot_thread_id",
        "thread.history_complete",
      ])
      .where("ticket.base_id", "=", args.baseId)
      .where("ticket.table_id", "=", args.tableId)
      .where(sql<boolean>`lower(coalesce(ticket.ticket_status, '')) = 'finish'`)
      .execute();
    const selection = findFinishedTicketThreadBackfillCandidates(rows);
    const candidates = args.limit === undefined
      ? selection.candidates
      : selection.candidates.slice(0, args.limit);
    const summary = {
      apply: args.apply,
      baseId: args.baseId,
      tableId: args.tableId,
      scanned: rows.length,
      candidates: selection.candidates.length,
      limitedCandidates: candidates.length,
      limit: args.limit,
      alreadyComplete: selection.alreadyComplete,
      missingThreadLink: selection.missingThreadLink,
      ignoredNonFinished: selection.ignoredNonFinished,
    };
    if (!args.apply) {
      process.stdout.write(`[finished-lark-ticket-thread-backfill] ${JSON.stringify(summary)}\n`);
      return;
    }

    const syncStore = new PostgresPlatformSyncStore(db);
    const tickets = await syncStore.getLarkBaseTicketsForCleaning(candidates);
    const ticketByRecord = new Map(tickets.map((ticket) => [ticket.recordId, ticket]));
    const threadContextService = createLarkTicketThreadContextService();
    const results = await mapWithConcurrency(candidates, args.concurrency, async (candidate) => {
      const ticket = ticketByRecord.get(candidate.recordId);
      if (!ticket) return { recordId: candidate.recordId, outcome: "failed" as const, error: "SYNCHRONIZED_TICKET_NOT_FOUND" };
      try {
        const ensured = await threadContextService.ensure({
          masterUserId: args.masterUserId!,
          larkBaseUrl: args.larkBaseUrl!,
          ticket,
        });
        return { recordId: candidate.recordId, outcome: "succeeded" as const, source: ensured.source };
      } catch (error) {
        return {
          recordId: candidate.recordId,
          outcome: "failed" as const,
          error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
        };
      }
    });
    const failures = results.filter((result) => result.outcome === "failed");
    process.stdout.write(`[finished-lark-ticket-thread-backfill] ${JSON.stringify({
      ...summary,
      attempted: results.length,
      succeeded: results.length - failures.length,
      failed: failures.length,
      failures,
    })}\n`);
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await closeSharedDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[finished-lark-ticket-thread-backfill] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
