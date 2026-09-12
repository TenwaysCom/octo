import "dotenv/config";
import { fileURLToPath } from "node:url";
import { closeSharedDatabase, ensureSharedDatabase } from "../adapters/postgres/database.js";
import { parseLarkTicketAiData, pickLarkTicketAiFields } from "../domain/lark-ticket-ai.js";

export function parseArgs(argv: string[]) {
  return { apply: argv.includes("--apply") };
}

export function findTicketAiBackfillCandidates(rows: Array<{
  base_id: string;
  table_id: string;
  record_id: string;
  fields_json: string;
  ticket_ai: string | null;
}>) {
  return rows.flatMap((row) => {
    let sourceFields: Record<string, unknown>;
    try {
      const parsed = JSON.parse(row.fields_json) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
      sourceFields = parsed as Record<string, unknown>;
    } catch {
      return [];
    }
    const fields = Object.fromEntries(Object.entries(pickLarkTicketAiFields(sourceFields)).filter(([, value]) => (
      value != null
      && (typeof value !== "string" || value.trim() !== "")
      && (!Array.isArray(value) || value.length > 0)
    )));
    if (!Object.keys(fields).length) return [];
    const existing = parseLarkTicketAiData(row.ticket_ai);
    const mergedFields = { ...fields, ...existing?.fields };
    if (existing && JSON.stringify(existing.fields) === JSON.stringify(mergedFields)) return [];
    const now = new Date().toISOString();
    return [{
      baseId: row.base_id,
      tableId: row.table_id,
      recordId: row.record_id,
      ticketAi: JSON.stringify({ fields: mergedFields, updatedAt: now }),
    }];
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = await ensureSharedDatabase();
  try {
  const rows = await db.selectFrom("lark_base_ticket_syncs as sync")
    .leftJoin("lark_base_ticket_octo as octo", (join) => join
      .onRef("octo.base_id", "=", "sync.base_id")
      .onRef("octo.table_id", "=", "sync.table_id")
      .onRef("octo.record_id", "=", "sync.record_id"))
    .select(["sync.base_id", "sync.table_id", "sync.record_id", "sync.fields_json", "octo.ticket_ai"])
    .execute();
  const candidates = findTicketAiBackfillCandidates(rows);
  let updated = 0;
  if (args.apply) {
    for (const candidate of candidates) {
      const now = new Date().toISOString();
      await db.insertInto("lark_base_ticket_octo").values({
        base_id: candidate.baseId,
        table_id: candidate.tableId,
        record_id: candidate.recordId,
        shared_url: null,
        ticket_ai: candidate.ticketAi,
        shadow_ai: "{}",
        local_json: "{}",
        created_at: now,
        updated_at: now,
      }).onConflict((conflict) => conflict.columns(["base_id", "table_id", "record_id"])
        .doUpdateSet({ ticket_ai: candidate.ticketAi, updated_at: now }))
        .execute();
      updated++;
    }
  }
  process.stdout.write(`[lark-ticket-ai-backfill] ${JSON.stringify({ scanned: rows.length, candidates: candidates.length, updated, apply: args.apply })}\n`);
  } finally {
    await closeSharedDatabase();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
