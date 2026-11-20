import { DataType } from "pg-mem";
import { createTestPostgresDatabase } from "../adapters/postgres/test-db.js";
import { serializePreparedMessages } from "../adapters/postgres/lark-ticket-thread-sync-store.js";
import { runTicketKcs } from "./ticket-kcs.js";

const scope = { base_id: "demo-base", table_id: "demo-table" };
const now = Date.parse("2026-11-01T02:00:00Z");
const closedAt = "2026-11-01T00:00:00Z";
type Dependencies = Parameters<typeof runTicketKcs>[1];

async function invoke(args: string[], overrides: Partial<Dependencies> = {}) {
  const write = vi.fn<(line: string) => void>();
  const writeError = vi.fn<(line: string) => void>();
  const exitCode = await runTicketKcs(args, {
    openDatabase: () => { throw new Error("Unexpected database access"); },
    createCompletionClient: () => { throw new Error("Unexpected completion request"); },
    readPrompt: () => " Summarize the sample case.\n",
    now: () => now,
    write,
    writeError,
    ...overrides,
  });
  return { exitCode, output: write.mock.calls.map(([line]) => JSON.parse(line)), errors: writeError.mock.calls.flat() };
}

function ticket(recordId: string, closure = closedAt) {
  return {
    ...scope,
    record_id: recordId,
    ticket_number: `DEMO-${recordId}`,
    title: "List export example for demo@example.com",
    ticket_status: " Finish ",
    stale: false,
    fields_json: JSON.stringify({ 关闭时间: Date.parse(closure), 解决方案: "Rechecked list export with demo@example.com" }),
    synced_at: closedAt,
  };
}

async function database() {
  const { db, pool, memoryDb } = await createTestPostgresDatabase();
  memoryDb.public.registerFunction({ name: "btrim", args: [DataType.text], returns: DataType.text, implementation: (text: string) => text.trim() });
  const startReadOnly = vi.fn();
  // pg-mem cannot parse PostgreSQL's transaction access mode.
  memoryDb.public.interceptQueries((query) => {
    if (!/^start transaction read only;?$/i.test(query.trim())) return null;
    startReadOnly();
    return [];
  });
  return { db, pool, startReadOnly };
}

describe("ticket-kcs CLI", () => {
  it("exports scoped closures after the offset cutoff with current or rebuilt prepared messages", async () => {
    const { db, pool, startReadOnly } = await database();
    try {
      await db.insertInto("lark_base_ticket_syncs").values([
        ...["cached", "old-redaction", "old-schema", "old-version", "bad-cache", "no-cache", "corrupt", "fields-only"].map((recordId) => ticket(recordId)),
        ticket("before", "2026-10-31T15:59:59Z"),
        ticket("at-cutoff", "2026-10-31T16:00:00Z"),
        ticket("future", "2026-11-01T02:00:01Z"),
        { ...ticket("missing-closure"), fields_json: "{}" },
        { ...ticket("stale"), stale: true },
        { ...ticket("open"), ticket_status: "In Progress" },
        { ...ticket("wrong-base"), base_id: "another-base" },
        { ...ticket("wrong-table"), table_id: "another-table" },
      ]).execute();
      const prepared = serializePreparedMessages([{
        messageId: "cached-message", senderRole: "user", senderLabel: "用户 1", text: "Prepared chat", hasArtifact: false,
      }], 4);
      const messagesJson = JSON.stringify({ schemaVersion: 1, messages: [{
        messageId: "raw-message", senderId: "sender-placeholder", senderType: "user", messageType: "text",
        content: "Raw chat from demo@example.com",
      }] });
      const thread = (recordId: string, preparedJson: string | null, rawJson = messagesJson) => ({
        ...scope, record_id: recordId, thread_id: `thread-${recordId}`, message_link: "https://example.com/thread",
        messages_json: rawJson, prepared_messages_json: preparedJson, snapshot_version: 4,
        history_complete: true, last_successful_sync_at: closedAt, created_at: closedAt, updated_at: closedAt,
      });
      await db.insertInto("lark_ticket_thread_syncs").values([
        thread("cached", prepared),
        thread("old-redaction", prepared.replace(/"redactionVersion":"[^"]+"/, '"redactionVersion":"v0"')),
        thread("old-schema", prepared.replace('"schemaVersion":1', '"schemaVersion":2')),
        thread("old-version", prepared.replace('"snapshotVersion":4', '"snapshotVersion":3')),
        thread("bad-cache", prepared.replace('"messageId":"cached-message"', '"messageId":null')),
        thread("no-cache", null),
        thread("corrupt", "malformed", '{"schemaVersion":1,"messages":[null]}'),
        { ...thread("fields-only", prepared), table_id: "another-table" },
      ]).execute();

      const result = await invoke(["snapshots", scope.base_id, scope.table_id, "2026-11-01T00:00:00+08:00"], { openDatabase: () => db });
      expect(result).toMatchObject({ exitCode: 0, errors: [] });
      expect(startReadOnly).toHaveBeenCalledOnce();
      expect(result.output.map((row) => row.record_id)).toEqual([
        "bad-cache", "cached", "corrupt", "fields-only", "no-cache", "old-redaction", "old-schema", "old-version",
      ]);
      for (const row of result.output) {
        expect(row).toMatchObject({ ...scope, closed_at: "2026-11-01T00:00:00.000Z", title: expect.stringContaining("[EMAIL]"),
          _ticket_fields: { 解决方案: "Rechecked list export with [EMAIL]" } });
        if (row.record_id === "fields-only") {
          expect(row.thread).toEqual({ thread_id: null, snapshot_version: null, history_complete: null,
            last_successful_sync_at: null, prepared_messages: null });
        } else if (row.record_id === "corrupt") {
          expect(row.thread).toMatchObject({ history_complete: false, prepared_messages: { schemaVersion: 1, snapshotVersion: 4, messages: [] } });
        } else if (row.record_id === "cached") {
          expect(row.thread).toMatchObject({ snapshot_version: 4, history_complete: true });
          expect(row.thread.prepared_messages).toEqual(JSON.parse(prepared));
        } else {
          expect(row.thread).toMatchObject({ snapshot_version: 4, history_complete: true, prepared_messages: {
            schemaVersion: 1, redactionVersion: JSON.parse(prepared).redactionVersion, snapshotVersion: 4,
            messages: [{ messageId: "raw-message", text: "Raw chat from [EMAIL]" }],
          } });
        }
      }
      expect(JSON.stringify(result.output)).not.toMatch(/demo@example\.com|sender-placeholder/);
    } finally {
      await db.destroy();
      await pool.end();
    }
  });

  it("exports an explicitly selected fields-only ticket closed before activation", async () => {
    const { db, pool } = await database();
    try {
      const archivalClosure = "2026-09-01T00:30:00Z";
      await db.insertInto("lark_base_ticket_syncs").values([ticket("archived", archivalClosure), ticket("other")]).execute();
      expect(await invoke(["snapshot", scope.base_id, scope.table_id, "archived"], { openDatabase: () => db })).toMatchObject({
        exitCode: 0, output: [{ record_id: "archived", closed_at: "2026-09-01T00:30:00.000Z", thread: {
          thread_id: null, history_complete: null, prepared_messages: null,
        } }], errors: [],
      });
    } finally {
      await db.destroy();
      await pool.end();
    }
  });

  it("exports eligible snapshots before and after rows with malformed source fields", async () => {
    const { db, pool } = await database();
    try {
      await db.insertInto("lark_base_ticket_syncs").values([
        ticket("a-valid"),
        { ...ticket("b-invalid-json"), fields_json: "MALFORMED_PRIVATE_FIELDS" },
        { ...ticket("c-invalid-shape"), fields_json: '["PRIVATE_FIELDS_ARRAY"]' },
        ticket("d-valid"),
      ]).execute();

      const result = await invoke(["snapshots", scope.base_id, scope.table_id, "2026-11-01T00:00:00+08:00"], { openDatabase: () => db });
      expect(result.exitCode).toBe(0);
      expect(result.output.map((row) => row.record_id)).toEqual(["a-valid", "d-valid"]);
      expect(result.errors).toEqual(["ticket-kcs skipped 2 snapshots with invalid fields_json.\n"]);
    } finally {
      await db.destroy();
      await pool.end();
    }
  });

  it("fails without emitting a snapshot when the selected ticket has malformed source fields", async () => {
    const { db, pool } = await database();
    try {
      await db.insertInto("lark_base_ticket_syncs").values({
        ...ticket("invalid"), fields_json: "MALFORMED_PRIVATE_FIELDS",
      }).execute();

      expect(await invoke(["snapshot", scope.base_id, scope.table_id, "invalid"], { openDatabase: () => db })).toEqual({
        exitCode: 1,
        output: [],
        errors: ["ticket-kcs failed. The selected snapshot has invalid fields_json.\n"],
      });
    } finally {
      await db.destroy();
      await pool.end();
    }
  });

  it.each([
    ["succeeded", "2026-11-01T01:30:00Z", 0],
    ["succeeded", "2026-11-01T01:29:59Z", 3],
    ["running", null, 3],
  ] as const)("checks the latest scoped sync run (%s, %s)", async (status, completedAt, exitCode) => {
    const { db, pool } = await database();
    try {
      const scopeKey = `${scope.base_id}/${scope.table_id}`;
      const run = {
        platform: "lark", trigger: "scheduled", scope_key: scopeKey, mode: "incremental", status: "succeeded",
        attempt: 1, clean_after_sync: false, completed_at: "2026-11-01T01:59:00Z", started_at: "2026-11-01T01:50:00Z",
      } as const;
      await db.insertInto("platform_sync_runs").values([
        { ...run, run_id: "old", action_run_id: "old", started_at: "2026-11-01T01:00:00Z" },
        { ...run, run_id: "scope", action_run_id: "scope", status, completed_at: completedAt, started_at: "2026-11-01T01:25:00Z" },
        { ...run, run_id: "other", action_run_id: "other", scope_key: "demo-base/other-table" },
        { ...run, run_id: "cleanup", action_run_id: "cleanup", mode: "clean" },
      ]).execute();
      expect(await invoke(["sync-ready", scope.base_id, scope.table_id, "30"], { openDatabase: () => db })).toEqual({
        exitCode, output: [{ stage: "octo_sync", ready: exitCode === 0, status, completed_at: completedAt }], errors: [],
      });
    } finally {
      await db.destroy();
      await pool.end();
    }
  });

  it("renders a validated draft using the CLI prompt from stdin", async () => {
    const draft = { record: true, title: "List export", environments: ["EU Odoo 17"], markdown: "### 当前结果\nVerified export." };
    const createJsonCompletion = vi.fn().mockResolvedValue({ content: JSON.stringify(draft), model: "test" });
    const result = await invoke(["render"], { createCompletionClient: () => ({ createJsonCompletion }) });
    expect(createJsonCompletion).toHaveBeenCalledOnce();
    expect(createJsonCompletion).toHaveBeenCalledWith({ prompt: "Summarize the sample case.", reasoningEffort: "low", actionRunId: expect.any(String) });
    expect(result).toEqual({ exitCode: 0, output: [draft], errors: [] });
  });

  it.each([
    "not JSON",
    JSON.stringify({ record: false, unexpected: "PROVIDER_CONTENT" }),
    JSON.stringify({ record: true, title: "List export", environments: ["Unsupported"], markdown: "Outcome" }),
  ])("returns an error without emitting an invalid provider response (%s)", async (content) => {
    const result = await invoke(["render"], { createCompletionClient: () => ({ createJsonCompletion: async () => ({ content, model: "test" }) }) });
    expect(result).toMatchObject({ exitCode: 1, output: [], errors: [expect.stringContaining("ticket-kcs failed")] });
    expect(result.errors.join("\n")).not.toContain(content);
  });
});
