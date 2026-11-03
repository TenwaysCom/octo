import { Pool } from "pg";
import { prepareTicketThread, redactSupportText } from "../../domain/support-ticket-analysis.js";
import type { LarkTicketThreadMessage } from "./lark-ticket-thread-sync-store.js";

/** Dedicated read-only connection: deliberately does not initialize/migrate the app DB. */
export async function exportTicketEvalRows(input: { connectionString: string; baseId: string; tableId: string; limit: number }) {
  const pool = new Pool({ connectionString: input.connectionString, max: 1 });
  const db = await pool.connect().catch(async (error: unknown) => { await pool.end(); throw error; });
  try {
    await db.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows } = await db.query(`SELECT t.base_id, t.table_id, t.record_id, t.ticket_number, t.title,
      t.fields_json, t.synced_at, t.stale, s.messages_json, s.history_complete, s.snapshot_version,
      s.last_successful_sync_at, o.shadow_ai
      FROM lark_base_ticket_syncs t
      LEFT JOIN lark_ticket_thread_syncs s USING (base_id, table_id, record_id)
      LEFT JOIN lark_base_ticket_octo o USING (base_id, table_id, record_id)
      WHERE t.base_id = $1 AND t.table_id = $2
      ORDER BY t.record_id LIMIT $3`, [input.baseId, input.tableId, input.limit]);
    const result = rows.map((row) => {
      const messages = (JSON.parse(row.messages_json || '{"messages":[]}').messages ?? []) as LarkTicketThreadMessage[];
      const fields = JSON.parse(row.fields_json || "{}");
      return {
        ticket: { baseId: row.base_id, tableId: row.table_id, recordId: row.record_id },
        number: row.ticket_number ?? "", title: redactSupportText(row.title),
        business: redactSupportText(typeof fields["Business line"] === "string" ? fields["Business line"] : ""),
        synced_at: row.last_successful_sync_at ?? row.synced_at, stale: row.stale,
        history_complete: row.history_complete === true, snapshot_version: row.snapshot_version,
        // Raw content and sender IDs never leave the export adapter.
        timing: messages.map(({ messageId, rootId, parentId, createdAt, updatedAt, deleted }) =>
          ({ messageId, rootId, parentId, createdAt, updatedAt, deleted })),
        messages: prepareTicketThread(messages),
        shadow: JSON.parse(redactSupportText(row.shadow_ai || "{}")),
      };
    });
    const promptRows = await db.query("SELECT key, prompt FROM workflow_prompts WHERE key = ANY($1::text[])", [[
      "lark_ticket.shadow.summarize", "lark_ticket.wiki_qa.extract", "lark_ticket.wiki_qa.rerank", "lark_ticket.wiki_qa.answer",
    ]]);
    await db.query("COMMIT");
    return { tickets: result, prompts: Object.fromEntries(promptRows.rows.filter((r) => r.prompt?.trim()).map((r) => [r.key, r.prompt])) };
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); await pool.end(); }
}
