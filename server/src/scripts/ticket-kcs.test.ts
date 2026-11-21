import { createHash } from "node:crypto";
import { DataType } from "pg-mem";
import { createTestPostgresDatabase } from "../adapters/postgres/test-db.js";
import { serializePreparedMessages } from "../adapters/postgres/lark-ticket-thread-sync-store.js";
import { createZcodeChatClient } from "../adapters/zcode/zcode-chat-client.js";
import { MAX_KCS_IMAGE_BYTES } from "../domain/kcs-image-evidence.js";
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

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUqkAAAAASUVORK5CYII=", "base64");

async function imageDatabase() {
  const fixture = await database();
  const { db } = fixture;
  await db.insertInto("lark_base_ticket_syncs").values([ticket("images"), ticket("other")]).execute();
  await db.insertInto("lark_ticket_thread_syncs").values({
    ...scope, record_id: "images", thread_id: "test-thread", message_link: "https://example.com/thread",
    messages_json: JSON.stringify({ schemaVersion: 1, messages: [
      { messageId: "m1", messageType: "text", content: "Request: inspect this error" },
      { messageId: "m2", messageType: "image", content: JSON.stringify({ image_key: "standalone" }) },
      { messageId: "m3", messageType: "post", content: JSON.stringify({
        content: [[{ tag: "img", image_key: "embedded" }, { tag: "img" }]],
        content_v2: [[{ tag: "img", image_key: "alternate-must-not-be-used" }]],
      }) },
      { messageId: "m4", messageType: "post", content: JSON.stringify({
        content: [[{ tag: "text", text: "  " }]],
        content_v2: [[{ tag: "img", image_key: "fallback" }]],
      }) },
      { messageId: "m5", messageType: "image", deleted: true, content: JSON.stringify({ image_key: "deleted" }) },
    ] }),
    snapshot_version: 1, history_complete: true, last_successful_sync_at: closedAt,
    created_at: closedAt, updated_at: closedAt,
  }).execute();
  return fixture;
}

describe("ticket-kcs image evidence", () => {
  it("exports ordered standalone and post sources, including a missing key", async () => {
    const { db, pool } = await imageDatabase();
    try {
      const result = await invoke(["snapshots", scope.base_id, scope.table_id, "2000-01-01T00:00:00Z"], { openDatabase: () => db });
      expect(result.exitCode).toBe(0);
      expect(result.output[0].images).toEqual([
        { message_id: "m2", message_index: 2, image_index: 1, image_key: "standalone" },
        { message_id: "m3", message_index: 3, image_index: 1, image_key: "embedded" },
        { message_id: "m3", message_index: 3, image_index: 2, image_key: null },
        { message_id: "m4", message_index: 4, image_index: 1, image_key: "fallback" },
      ]);
      expect(result.output[0]).toMatchObject({ image_manifest_version: 1, image_counts: { 2: 1, 3: 2, 4: 1 } });
      expect(result.output[1]).toHaveProperty("image_manifest_version", 1);
      expect(result.output[1]).not.toHaveProperty("images");
    } finally {
      await db.destroy();
      await pool.end();
    }
  });

  it.each([
    { recordId: "images", messageId: "m2", imageKey: "standalone", allowed: true },
    { recordId: "other", messageId: "m2", imageKey: "standalone", allowed: false },
    { recordId: "images", messageId: "m3", imageKey: "alternate-must-not-be-used", allowed: false },
    { recordId: "images", messageId: "m3", imageKey: "standalone", allowed: false },
    { recordId: "images", messageId: "m5", imageKey: "deleted", allowed: false },
  ])("authenticates resource membership before download for $recordId/$messageId/$imageKey", async ({
    recordId, messageId, imageKey, allowed,
  }) => {
    const { db, pool } = await imageDatabase();
    try {
      const downloadMessageImage = vi.fn().mockResolvedValue(png);
      const createImageClient = vi.fn().mockResolvedValue({ downloadMessageImage });
      const result = await invoke(["image", scope.base_id, scope.table_id, recordId, messageId, imageKey], {
        openDatabase: () => db, createImageClient,
      });
      if (allowed) {
        expect(result).toEqual({ exitCode: 0, errors: [], output: [{
          media_type: "image/png", sha256: createHash("sha256").update(png).digest("hex"),
          data_base64: png.toString("base64"),
        }] });
        expect(downloadMessageImage).toHaveBeenCalledWith({ messageId, imageKey, maxBytes: MAX_KCS_IMAGE_BYTES });
      } else {
        expect(result).toMatchObject({ exitCode: 1, output: [] });
        expect(createImageClient).not.toHaveBeenCalled();
        expect(result.errors.join("")).not.toContain(imageKey);
      }
    } finally {
      await db.destroy();
      await pool.end();
    }
  });

  it("sends validated original PNG pixels in a GLM image_url and returns bounded factual evidence", async () => {
    const observation = { observation: "The window contains an error.", visible_text: ["Export error"],
      limitations: "The workflow after the error is outside the screenshot." };
    const model = "glm-4.6v";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(observation) } }],
    })));
    const result = await invoke(["inspect-image"], {
      readPrompt: () => JSON.stringify({ media_type: "image/png", data_base64: png.toString("base64") }),
      createVisionClient: () => createZcodeChatClient({ model, apiKey: "test-only", fetchImpl }),
    });
    expect(result).toEqual({ exitCode: 0, errors: [], output: [{ ...observation, model }] });
    const requestBody = fetchImpl.mock.calls[0]?.[1]?.body;
    expect(typeof requestBody).toBe("string");
    expect(JSON.parse(String(requestBody))).toMatchObject({ model, messages: [
      { role: "system" },
      { role: "user", content: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } },
        { type: "text", text: expect.any(String) },
      ] },
    ] });
  });

  it.each([
    { media_type: "image/jpeg", data_base64: png.toString("base64") },
    { media_type: "image/png", data_base64: "bm90IGEgcG5n" },
    { media_type: "image/png", data_base64: png.toString("base64") + " " },
    { media_type: "image/png", data_base64: png.toString("base64"), unexpected: "field" },
  ])("rejects image bytes that do not match the vision contract", async (input) => {
    const createVisionClient = vi.fn();
    const result = await invoke(["inspect-image"], { readPrompt: () => JSON.stringify(input), createVisionClient });
    expect(result).toMatchObject({ exitCode: 1, output: [] });
    expect(createVisionClient).not.toHaveBeenCalled();
    expect(result.errors.join("")).not.toContain(input.data_base64);
  });
});
