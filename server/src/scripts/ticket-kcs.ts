import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { sql } from "kysely";
import { z } from "zod";
import { createTicketSummaryJsonCompletionClient } from "../adapters/ai/ticket-summary-client.js";
import { createPostgresDatabase } from "../adapters/postgres/database.js";
import { buildLarkTicketCleaningProjection } from "../application/services/lark-ticket-cleaning.js";
import { redactSupportText } from "../domain/support-ticket-analysis.js";

const identity = z.string().regex(/^[A-Za-z0-9_-]+$/);
const syncScope = z.tuple([identity, identity, z.iso.datetime({ offset: true })]);
const ticketScope = z.tuple([identity, identity, identity]);
const syncReadinessScope = z.tuple([identity, identity, z.coerce.number().int().min(1).max(1440)]);
const databaseFields = z.record(z.string(), z.unknown());
const draftSchema = z.discriminatedUnion("record", [
  z.object({ record: z.literal(false) }).strict(),
  z.object({
    record: z.literal(true),
    title: z.string().trim().min(1).max(200),
    environments: z.array(z.enum(["EU Odoo 17", "UK Odoo 17", "US Odoo 18", "待确认"])).max(4),
    markdown: z.string().trim().min(1).max(16000),
  }).strict(),
]);

function parseJson(value: string | null): unknown {
  return value === null ? null : JSON.parse(value);
}

async function listSnapshots([baseId, tableId, selector]: [string, string, string], single: boolean) {
  const cutoff = single ? 0 : Date.parse(selector);
  if (!Number.isFinite(cutoff)) throw new Error("Invalid activation time.");
  const db = createPostgresDatabase();
  try {
    const rows = await db.transaction().setAccessMode("read only").execute((trx) =>
      trx.selectFrom("lark_base_ticket_syncs as ticket")
        .leftJoin("lark_ticket_thread_syncs as thread", (join) => join
          .onRef("thread.base_id", "=", "ticket.base_id")
          .onRef("thread.table_id", "=", "ticket.table_id")
          .onRef("thread.record_id", "=", "ticket.record_id"))
        .select([
          "ticket.base_id", "ticket.table_id", "ticket.record_id", "ticket.ticket_number",
          "ticket.title", "ticket.issue_type", "ticket.ticket_status", "ticket.fields_json",
          "ticket.shared_url", "ticket.source_updated_at", "ticket.created_time",
          "thread.thread_id", "thread.snapshot_version", "thread.history_complete",
          "thread.last_successful_sync_at", "thread.prepared_messages_json",
        ])
        .where("ticket.base_id", "=", baseId)
        .where("ticket.table_id", "=", tableId)
        .where("ticket.stale", "=", false)
        .$if(single, (query) => query.where("ticket.record_id", "=", selector))
        .where(sql<boolean>`lower(btrim(ticket.ticket_status)) = 'finish'`)
        .orderBy("ticket.record_id").execute());
    const now = Date.now();
    let exported = false;
    for (const row of rows) {
      const fields = databaseFields.parse(parseJson(row.fields_json));
      const projection = buildLarkTicketCleaningProjection(fields, row.created_time ?? undefined);
      const closedAt = projection.closedAt;
      if (!closedAt || Date.parse(closedAt) <= cutoff || Date.parse(closedAt) > now) continue;
      if (!row.ticket_number?.trim() || !identity.safeParse(row.ticket_number).success) continue;
      const snapshot = {
        base_id: row.base_id,
        table_id: row.table_id,
        record_id: row.record_id,
        ticket_no: row.ticket_number,
        title: redactSupportText(row.title),
        issue_type: row.issue_type ?? "",
        ticket_status: "Finish",
        closed_at: closedAt,
        source_updated_at: row.source_updated_at,
        shared_url: row.shared_url,
        _created_time: projection.createdAt,
        _ticket_fields: {
          "Business line": redactSupportText(projection.businessLine),
          "解决方案": redactSupportText(projection.solution),
        },
        thread: {
          thread_id: row.thread_id,
          snapshot_version: row.snapshot_version,
          history_complete: row.history_complete,
          last_successful_sync_at: row.last_successful_sync_at,
          prepared_messages: parseJson(row.prepared_messages_json),
        },
      };
      process.stdout.write(JSON.stringify(snapshot) + "\n");
      exported = true;
    }
    if (single && !exported) throw new Error("No eligible closed ticket snapshot found.");
  } finally {
    await db.destroy();
  }
}

async function checkSyncReadiness([baseId, tableId, maxAgeMinutes]: [string, string, number]) {
  const scopeKey = `${baseId}/${tableId}`;
  const db = createPostgresDatabase();
  try {
    const latest = await db.transaction().setAccessMode("read only").execute((trx) =>
      trx.selectFrom("platform_sync_runs")
        .select(["status", "completed_at"])
        .where("platform", "=", "lark")
        .where("scope_key", "=", scopeKey)
        .where("mode", "in", ["incremental", "full"])
        .where("status", "in", ["queued", "running", "succeeded", "failed"])
        .orderBy("started_at", "desc")
        .executeTakeFirst());
    const completedAt = latest?.completed_at ?? null;
    const age = completedAt ? Date.now() - Date.parse(completedAt) : Number.NaN;
    const ready = latest?.status === "succeeded" && age >= 0 && age <= maxAgeMinutes * 60000;
    process.stdout.write(JSON.stringify({ stage: "octo_sync", ready, status: latest?.status ?? "missing", completed_at: completedAt }) + "\n");
    if (!ready) process.exitCode = 3;
  } finally {
    await db.destroy();
  }
}

async function renderDraft() {
  const prompt = readFileSync(0, "utf8").trim();
  if (!prompt || prompt.length > 90000) throw new Error("Invalid KCS prompt.");
  const result = await createTicketSummaryJsonCompletionClient().createJsonCompletion({
    prompt, actionRunId: randomUUID(), reasoningEffort: "low",
  });
  process.stdout.write(JSON.stringify(draftSchema.parse(JSON.parse(result.content))) + "\n");
}

config({ quiet: true });
const [action, ...args] = process.argv.slice(2);
try {
  if (action === "snapshots") await listSnapshots(syncScope.parse(args), false);
  else if (action === "snapshot") await listSnapshots(ticketScope.parse(args), true);
  else if (action === "sync-ready") await checkSyncReadiness(syncReadinessScope.parse(args));
  else if (action === "render" && !args.length) await renderDraft();
  else throw new Error("Unknown ticket-kcs action.");
} catch {
  process.stderr.write("ticket-kcs failed. Check command arguments, source connection, and the Ticket Summary provider configuration.\n");
  process.exitCode = 1;
}
