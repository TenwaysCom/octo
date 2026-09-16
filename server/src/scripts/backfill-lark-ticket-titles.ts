import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";

export const LARK_TICKET_TITLE_FIELD = "Issue Description";

export interface BackfillLarkTicketTitlesArgs {
  apply: boolean;
}

export function parseArgs(argv: string[]): BackfillLarkTicketTitlesArgs {
  if (argv.length === 0) return { apply: false };
  if (argv.length === 1 && argv[0] === "--apply") return { apply: true };
  throw new Error("Usage: pnpm --dir server platform:backfill-lark-ticket-titles [--apply]");
}

type LarkTicketSnapshot = {
  base_id: string;
  table_id: string;
  record_id: string;
  title: string;
  fields_json: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = await ensureSharedDatabase();
  try {
    const snapshots = await db.selectFrom("lark_base_ticket_syncs")
      .select(["base_id", "table_id", "record_id", "title", "fields_json"])
      .execute();
    const updates = findTitleUpdates(snapshots);
    let updated = 0;
    if (args.apply) {
      for (const update of updates) {
        await db.updateTable("lark_base_ticket_syncs").set({ title: update.title })
          .where("base_id", "=", update.baseId)
          .where("table_id", "=", update.tableId)
          .where("record_id", "=", update.recordId)
          .execute();
        updated += 1;
      }
    }
    process.stdout.write(`[lark-ticket-titles] ${JSON.stringify({
      field: LARK_TICKET_TITLE_FIELD,
      apply: args.apply,
      scanned: snapshots.length,
      candidates: updates.length,
      updated,
    })}\n`);
  } finally {
    await closeSharedDatabase();
  }
}

export function findTitleUpdates(snapshots: LarkTicketSnapshot[]): Array<{
  baseId: string;
  tableId: string;
  recordId: string;
  title: string;
}> {
  return snapshots.flatMap((snapshot) => {
    const title = extractTitle(snapshot.fields_json);
    if (!title || title === snapshot.title) return [];
    return [{ baseId: snapshot.base_id, tableId: snapshot.table_id, recordId: snapshot.record_id, title }];
  });
}

function extractTitle(fieldsJson: string): string | undefined {
  try {
    const fields = JSON.parse(fieldsJson) as Record<string, unknown>;
    return valueToText(fields[LARK_TICKET_TITLE_FIELD]) || undefined;
  } catch {
    return undefined;
  }
}

function valueToText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const entry = value as Record<string, unknown>;
    for (const key of ["text", "name", "label", "value"]) {
      const text = valueToText(entry[key]);
      if (text) return text;
    }
  }
  return "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    process.stderr.write(`[lark-ticket-titles] failed=${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
