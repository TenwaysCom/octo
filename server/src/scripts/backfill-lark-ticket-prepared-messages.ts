import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Kysely } from "kysely";
import {
  createPostgresDatabase,
  getDefaultPostgresUri,
} from "../adapters/postgres/database.js";
import { preparePostgresConnection } from "../adapters/postgres/ssh-tunnel.js";
import {
  serializePreparedMessages,
  type LarkTicketThreadMessage,
} from "../adapters/postgres/lark-ticket-thread-sync-store.js";
import type { DatabaseSchema } from "../adapters/postgres/schema.js";
import {
  prepareTicketThread,
  SUPPORT_REDACTION_VERSION,
} from "../domain/support-ticket-analysis.js";

const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 5;

export interface BackfillLarkTicketPreparedMessagesArgs {
  apply: boolean;
  baseId: string;
  tableId: string;
  concurrency: number;
  limit?: number;
}

export interface LarkTicketPreparedMessageRow {
  base_id: string;
  table_id: string;
  record_id: string;
  messages_json: string;
  prepared_messages_json: string | null;
  snapshot_version: number;
}

export interface PreparedMessageBackfillCandidate {
  baseId: string;
  tableId: string;
  recordId: string;
  snapshotVersion: number;
  preparedMessagesJson: string;
}

export interface PreparedMessageBackfillSelection {
  candidates: PreparedMessageBackfillCandidate[];
  alreadyCurrent: number;
  invalidMessagesJson: number;
}

function usage(): string {
  return "Usage: pnpm --dir server platform:backfill-lark-ticket-prepared-messages -- --base-id <baseId> --table-id <tableId> [--limit <positiveInteger>] [--concurrency 1-5] [--apply]";
}

function requireValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.\n${usage()}`);
  return value;
}

function parsePositiveInteger(value: string, name: string, maximum?: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || maximum !== undefined && parsed > maximum) {
    const range = maximum === undefined ? "a positive integer" : `an integer from 1 to ${maximum}`;
    throw new Error(`${name} must be ${range}.\n${usage()}`);
  }
  return parsed;
}

export function parseArgs(argv: string[]): BackfillLarkTicketPreparedMessagesArgs {
  const argumentsToParse = argv[0] === "--" ? argv.slice(1) : argv;
  let apply = false;
  let baseId: string | undefined;
  let tableId: string | undefined;
  let concurrency = DEFAULT_CONCURRENCY;
  let limit: number | undefined;
  for (let index = 0; index < argumentsToParse.length; index += 1) {
    const argument = argumentsToParse[index];
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--base-id") {
      baseId = requireValue(argumentsToParse, index, argument);
      index += 1;
    } else if (argument === "--table-id") {
      tableId = requireValue(argumentsToParse, index, argument);
      index += 1;
    } else if (argument === "--concurrency") {
      concurrency = parsePositiveInteger(requireValue(argumentsToParse, index, argument), argument, MAX_CONCURRENCY);
      index += 1;
    } else if (argument === "--limit") {
      limit = parsePositiveInteger(requireValue(argumentsToParse, index, argument), argument);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}.\n${usage()}`);
    }
  }
  if (!baseId || !tableId) throw new Error(`--base-id and --table-id are required.\n${usage()}`);
  return { apply, baseId, tableId, concurrency, limit };
}

function parseRawMessages(value: string): LarkTicketThreadMessage[] | undefined {
  try {
    const document = JSON.parse(value) as { schemaVersion?: unknown; messages?: unknown };
    return document.schemaVersion === 1 && Array.isArray(document.messages)
      ? document.messages as LarkTicketThreadMessage[]
      : undefined;
  } catch {
    return undefined;
  }
}

function isPreparedMessagesCurrent(value: string | null, snapshotVersion: number): boolean {
  if (!value) return false;
  try {
    const document = JSON.parse(value) as {
      schemaVersion?: unknown;
      redactionVersion?: unknown;
      snapshotVersion?: unknown;
      messages?: unknown;
    };
    return document.schemaVersion === 1
      && document.redactionVersion === SUPPORT_REDACTION_VERSION
      && document.snapshotVersion === snapshotVersion
      && Array.isArray(document.messages);
  } catch {
    return false;
  }
}

async function mapWithConcurrency<T, Result>(
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

export function findPreparedMessageBackfillCandidates(
  rows: LarkTicketPreparedMessageRow[],
): PreparedMessageBackfillSelection {
  const selection: PreparedMessageBackfillSelection = {
    candidates: [],
    alreadyCurrent: 0,
    invalidMessagesJson: 0,
  };
  for (const row of rows) {
    if (isPreparedMessagesCurrent(row.prepared_messages_json, row.snapshot_version)) {
      selection.alreadyCurrent += 1;
      continue;
    }
    const messages = parseRawMessages(row.messages_json);
    if (!messages) {
      selection.invalidMessagesJson += 1;
      continue;
    }
    try {
      selection.candidates.push({
        baseId: row.base_id,
        tableId: row.table_id,
        recordId: row.record_id,
        snapshotVersion: row.snapshot_version,
        preparedMessagesJson: serializePreparedMessages(prepareTicketThread(messages), row.snapshot_version),
      });
    } catch {
      selection.invalidMessagesJson += 1;
    }
  }
  return selection;
}

export async function applyPreparedMessageBackfill(
  db: Kysely<DatabaseSchema>,
  candidates: PreparedMessageBackfillCandidate[],
  concurrency: number,
): Promise<{ updated: number; stale: number }> {
  const results = await mapWithConcurrency(candidates, concurrency, async (candidate) => {
    const result = await db.updateTable("lark_ticket_thread_syncs")
      .set({ prepared_messages_json: candidate.preparedMessagesJson })
      .where("base_id", "=", candidate.baseId)
      .where("table_id", "=", candidate.tableId)
      .where("record_id", "=", candidate.recordId)
      .where("snapshot_version", "=", candidate.snapshotVersion)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1 ? "updated" as const : "stale" as const;
  });
  return {
    updated: results.filter((result) => result === "updated").length,
    stale: results.filter((result) => result === "stale").length,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const postgresUri = getDefaultPostgresUri();
  if (!postgresUri) throw new Error("POSTGRES_URI or DATABASE_URL is required");
  const connection = await preparePostgresConnection(postgresUri);
  const db = createPostgresDatabase(connection.postgresUri);
  try {
    const rows = await db.selectFrom("lark_ticket_thread_syncs")
      .select(["base_id", "table_id", "record_id", "messages_json", "prepared_messages_json", "snapshot_version"])
      .where("base_id", "=", args.baseId)
      .where("table_id", "=", args.tableId)
      .orderBy("record_id", "asc")
      .execute();
    const selection = findPreparedMessageBackfillCandidates(rows);
    const candidates = args.limit === undefined
      ? selection.candidates
      : selection.candidates.slice(0, args.limit);
    const applied = args.apply
      ? await applyPreparedMessageBackfill(db, candidates, args.concurrency)
      : { updated: 0, stale: 0 };
    process.stdout.write(`[lark-ticket-prepared-message-backfill] ${JSON.stringify({
      apply: args.apply,
      baseId: args.baseId,
      tableId: args.tableId,
      scanned: rows.length,
      candidates: selection.candidates.length,
      limitedCandidates: candidates.length,
      alreadyCurrent: selection.alreadyCurrent,
      invalidMessagesJson: selection.invalidMessagesJson,
      updated: applied.updated,
      stale: applied.stale,
    })}\n`);
    if (applied.stale > 0) process.exitCode = 1;
  } finally {
    await db.destroy();
    await connection.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[lark-ticket-prepared-message-backfill] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
