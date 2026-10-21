import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { createTicketSummaryJsonCompletionClient } from "../adapters/ai/ticket-summary-client.js";
import { readShadowFieldText } from "../domain/shadow-ticket-context.js";
import { redactSupportText } from "../domain/support-ticket-analysis.js";
import { LARK_TICKET_FIELD_CANDIDATES } from "../domain/lark-ticket-fields.js";
import { extractProfile, profileFingerprint, type ProfileInput } from "../domain/user-profile-extractor.js";

// Explicit dry-run: no schema bootstrap, sync, production writes or public exports.
// Temporary files are private review artifacts, never automatically committed.
const modelEnabled = process.argv.includes("--model");
const db = new pg.Client({
  connectionString: process.env.POSTGRES_URI || process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  options: "-c default_transaction_read_only=on -c statement_timeout=20000",
});
const parse = (value: unknown): Record<string, any> => {
  try { return typeof value === "string" ? JSON.parse(value) : value && typeof value === "object" ? value : {}; } catch { return {}; }
};
const pick = (fields: Record<string, any>, names: string[]) => names.map(n => fields[n]).find(v => v != null);

async function main() {
  const outputDir = await mkdtemp(join(tmpdir(), "octo-profile-validation-"));
  const reports: unknown[] = [];
  await db.connect();
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  // Group only within one Base/table identity context. Never merge applications.
  const groups = await db.query(`
    SELECT base_id, table_id, person->>'id' AS person_id,
           count(DISTINCT record_id)::int AS tickets
    FROM lark_base_ticket_syncs s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(fields_json::jsonb -> $1) = 'array'
      THEN fields_json::jsonb -> $1 ELSE '[]'::jsonb END) person
    WHERE person->>'id' IS NOT NULL
    GROUP BY base_id, table_id, person->>'id'
    HAVING count(DISTINCT record_id) BETWEEN 2 AND 8
    ORDER BY tickets DESC, base_id, table_id, person->>'id'`, [LARK_TICKET_FIELD_CANDIDATES.requester[0]]);
  const selected = [groups.rows.find(r => r.tickets >= 5), [...groups.rows].reverse().find(r => r.tickets <= 3)];
  if (selected.some(r => !r)) throw new Error("PROFILE_SAMPLE_UNAVAILABLE");
  const cases: Array<{ alias: string; input: ProfileInput; sourceMap: unknown[] }> = [];
  for (const [index, group] of selected.entries()) {
    const alias = `User-${index + 1}`;
    const result = await db.query(`
      SELECT s.record_id, s.title, s.detail_description, s.created_time, s.fields_json, s.stale,
             o.shadow_ai, t.snapshot_version, t.history_complete, t.dirty,
             t.last_successful_sync_at
      FROM lark_base_ticket_syncs s
      LEFT JOIN lark_base_ticket_octo o USING (base_id, table_id, record_id)
      LEFT JOIN lark_ticket_thread_syncs t USING (base_id, table_id, record_id)
      WHERE s.base_id=$1 AND s.table_id=$2
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(s.fields_json::jsonb -> $3)='array'
          THEN s.fields_json::jsonb -> $3 ELSE '[]'::jsonb END) p WHERE p->>'id'=$4)
      ORDER BY s.created_time NULLS FIRST, s.record_id`,
    [group.base_id, group.table_id, LARK_TICKET_FIELD_CANDIDATES.requester[0], group.person_id]);
    const personValues = new Set<string>();
    for (const row of result.rows) {
      const fields = parse(row.fields_json);
      for (const names of [LARK_TICKET_FIELD_CANDIDATES.requester, LARK_TICKET_FIELD_CANDIDATES.responsible]) {
        const people = pick(fields, names);
        if (Array.isArray(people)) for (const person of people) for (const key of ["name", "en_name", "id", "email"]) {
          if (typeof person?.[key] === "string" && person[key].length >= 2) personValues.add(person[key]);
        }
      }
    }
    const redact = (value: unknown) => {
      let text = redactSupportText(readShadowFieldText(value));
      for (const person of [...personValues].sort((a, b) => b.length - a.length)) text = text.split(person).join("[person]");
      return text.replace(/https?:\/\/\S+/g, "[link]")
        .replace(/\bFrom\s+[^\n]+/g, "From [person]")
        .replace(/\b(?:ou_|on_|om_)[A-Za-z0-9_-]+\b/g, "[id]");
    };
    const input: ProfileInput = {
      subjectKey: `validation:${alias}`, accessScope: `validation:single-base-table:${index + 1}`,
      methodVersion: "v3-draft", windowPolicy: "validation-all-recorded-history-in-one-table",
      tickets: [], evidence: [], limitations: [
        "本次仅验证单一Base/table中全部已收录历史工单，不代表全平台历史；使用调用方指定的全历史窗口。",
        "尚未验证消息发送者与需求人身份对应；本次不提供角色已确认的原始消息，不生成性格特点或沟通特点；只有需求特点可依据原始需求字段提炼。",
        "Shadow为二手AI分析，未逐条回查原始聊天；历史结果不能认定用户恢复确认。",
        "不同Ticket可能来自同一问题的拆分或追问；只有业务场景相似不足以证明独立的重复行为。",
      ],
    };
    const sourceMap: unknown[] = [];
    for (const [i, row] of result.rows.entries()) {
      const key = `T${i + 1}`; const fields = parse(row.fields_json); const shadow = parse(row.shadow_ai);
      const fieldText = redact([
        `title: ${row.title || ""}`, `description: ${row.detail_description || ""}`,
        `business: ${readShadowFieldText(pick(fields, LARK_TICKET_FIELD_CANDIDATES.businessLine))}`,
        `solution: ${readShadowFieldText(pick(fields, LARK_TICKET_FIELD_CANDIDATES.solution))}`,
        `created: ${row.created_time || "unknown"}`,
      ].join("\n"));
      input.evidence.push({ id: `${key}.fields`, ticketKey: key, kind: "ticket_field", role: "unknown", text: fieldText, version: "read-snapshot" });
      const analysis = shadow.analysis?.analysis;
      if (shadow.status === "ok" && analysis && shadow.snapshotVersion === row.snapshot_version && !row.dirty) {
        input.evidence.push({ id: `${key}.shadow`, ticketKey: key, kind: "shadow", role: "unknown",
          text: redact(JSON.stringify({ summary: shadow.analysis.summary, intent: analysis.intent, result: analysis.result })),
          version: `${shadow.snapshotVersion}:${shadow.promptVersion ?? "unknown"}:${shadow.analyzedAt ?? "unknown"}` });
      } else input.limitations.push(`${key} Shadow 缺失或版本不一致，仅用原始字段。`);
      if (row.stale) input.limitations.push(`${key} 为 stale 历史记录，不代表当前状态。`);
      if (!row.history_complete) input.limitations.push(`${key} 线程完整性不足。`);
      input.tickets.push({ key, semanticVersion: JSON.stringify({ shadowVersion: shadow.snapshotVersion ?? null, threadVersion: row.snapshot_version ?? null, stale: row.stale, complete: row.history_complete, dirty: row.dirty }) });
      sourceMap.push({ key, baseId: group.base_id, tableId: group.table_id, recordId: row.record_id });
    }
    // Fail rather than silently truncate the user evidence.
    if (JSON.stringify(input).length > 80000) throw new Error("PROFILE_INPUT_TOO_LARGE");
    cases.push({ alias, input, sourceMap });
  }
  await db.query("ROLLBACK");
  await db.end();
  for (const item of cases) {
    await writeFile(join(outputDir, `${item.alias}.input.json`), JSON.stringify(item.input, null, 2), { mode: 0o600 });
    await writeFile(join(outputDir, `${item.alias}.private-source-map.json`), JSON.stringify(item.sourceMap), { mode: 0o600 });
    if (!modelEnabled) { reports.push({ user: item.alias, tickets: item.input.tickets.length, evidence: item.input.evidence.length }); continue; }
    const client = createTicketSummaryJsonCompletionClient();
    // Held-out ticket replay, not a reconstruction of historical database state.
    const newest = item.input.tickets.at(-1)!.key;
    const before: ProfileInput = { ...item.input,
      tickets: item.input.tickets.filter(t => t.key !== newest),
      evidence: item.input.evidence.filter(e => e.ticketKey !== newest),
      limitations: item.input.limitations.filter(l => !l.startsWith(`${newest} `)),
    };
    const initial = await extractProfile({ client, input: before, actionRunId: randomUUID(), now: () => new Date(), readCurrentFingerprint: async () => profileFingerprint(before) });
    if (initial.status !== "ready") throw new Error("PROFILE_INITIAL_FAILED");
    const updated = await extractProfile({ client, input: item.input, previous: initial.revision, actionRunId: randomUUID(), now: () => new Date(), readCurrentFingerprint: async () => profileFingerprint(item.input) });
    if (updated.status !== "ready") throw new Error("PROFILE_INCREMENTAL_FAILED");
    const unchanged = await extractProfile({ client, input: item.input, previous: updated.revision, actionRunId: randomUUID(), now: () => new Date(), readCurrentFingerprint: async () => profileFingerprint(item.input) });
    await writeFile(join(outputDir, `${item.alias}.results.json`), JSON.stringify({ initial, updated, unchangedStatus: unchanged.status }, null, 2), { mode: 0o600 });
    reports.push({ user: item.alias, beforeTickets: before.tickets.length, afterTickets: item.input.tickets.length,
      initial: initial.status, updated: updated.status, unchanged: unchanged.status,
      initialClaims: initial.revision!.output.claims.length, updatedClaims: updated.revision!.output.claims.length,
      personalityTraits: updated.revision!.output.claims.filter(c => c.kind === "personality").length,
      communicationTraits: updated.revision!.output.claims.filter(c => c.kind === "communication").length,
      needTraits: updated.revision!.output.claims.filter(c => c.kind === "needs").length,
      model: updated.revision!.model });
  }
  process.stdout.write(JSON.stringify({ outputDir, modelEnabled, reports }) + "\n");
}
main().catch(async () => {
  await db.end().catch(() => undefined);
  process.stderr.write("PROFILE_VALIDATION_FAILED; no source payload or credentials emitted\n");
  process.exitCode = 1;
});
