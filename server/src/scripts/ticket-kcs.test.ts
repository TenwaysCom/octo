import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const pngSha256 = createHash("sha256").update(png).digest("hex");
const imageLogContext = {
  actionRunId: "8e24711b-3970-45c8-9f50-d3b06c2bf250",
  baseId: scope.base_id, tableId: scope.table_id, recordId: "images", ticketNo: "DEMO-images",
  messageId: "m2", messageIndex: 2, imageIndex: 1,
};
const imagePrompt = () => JSON.stringify({ media_type: "image/png", data_base64: png.toString("base64") });

function captureImageLogs(context: object = imageLogContext) {
  const events: object[] = [];
  const append = (event: object) => { events.push(event); };
  return { events, options: { imageLogContext: JSON.stringify(context), imageLogger: { info: append, warn: append } } };
}

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
      const { events, options } = captureImageLogs();
      const downloadMessageImage = vi.fn().mockResolvedValue(png);
      const createImageClient = vi.fn().mockResolvedValue({ downloadMessageImage });
      const result = await invoke(["image", scope.base_id, scope.table_id, recordId, messageId, imageKey], {
        ...options, openDatabase: () => db, createImageClient,
      });
      if (allowed) {
        expect(result).toEqual({ exitCode: 0, errors: [], output: [{
          media_type: "image/png", sha256: pngSha256,
          data_base64: png.toString("base64"),
        }] });
        expect(downloadMessageImage).toHaveBeenCalledWith({ messageId, imageKey, maxBytes: MAX_KCS_IMAGE_BYTES });
        expect(createImageClient).toHaveBeenCalledWith(db, imageLogContext.actionRunId);
        expect(events).toContainEqual(expect.objectContaining({
          ...imageLogContext, phase: "completed", operation: "image", stage: "server.kcs-image.download",
          bytes: png.length, sha256: pngSha256, mediaType: "image/png", durationMs: expect.any(Number),
        }));
      } else {
        expect(result).toMatchObject({ exitCode: 1, output: [] });
        expect(createImageClient).not.toHaveBeenCalled();
        expect(result.errors.join("")).not.toContain(imageKey);
        expect(events.at(-1)).toMatchObject({
          recordId, messageId, operation: "image", phase: "failed", stage: "server.kcs-image.scope",
          errorCode: "KCS_IMAGE_SCOPE_INVALID",
        });
        expect(events.at(-1)).not.toMatchObject({ actionRunId: imageLogContext.actionRunId });
      }
      expect(JSON.stringify(events)).not.toContain(imageKey);
      expect(JSON.stringify(events)).not.toContain(png.toString("base64"));
    } finally {
      await db.destroy();
      await pool.end();
    }
  });

  it("sends validated original PNG pixels in a GLM image_url and returns bounded factual evidence", async () => {
    const { events, options } = captureImageLogs();
    const observation = { observation: "The window contains an error.", visible_text: ["Export error"],
      limitations: "The workflow after the error is outside the screenshot." };
    const model = "glm-4.6v";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(observation) } }],
      usage: { prompt_tokens: 201, completion_tokens: 115, total_tokens: 316, completion_tokens_details: { reasoning_tokens: 6 } },
    })));
    const completion = createZcodeChatClient({ model, apiKey: "test-only", fetchImpl });
    const createJsonCompletion = vi.spyOn(completion, "createJsonCompletion");
    const result = await invoke(["inspect-image"], {
      ...options, readPrompt: imagePrompt,
      createVisionClient: () => completion,
    });
    expect(result).toEqual({ exitCode: 0, errors: [], output: [{ ...observation, model }] });
    expect(createJsonCompletion).toHaveBeenCalledWith(expect.objectContaining({
      actionRunId: imageLogContext.actionRunId, collectDiagnostics: true,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      ...imageLogContext, operation: "inspect-image", phase: "completed", stage: "server.kcs-image.recognition",
      requestedModel: model, responseModel: model, httpStatus: 200, bytes: png.length, mediaType: "image/png",
      sha256: pngSha256, durationMs: expect.any(Number), responseHeadersMs: expect.any(Number),
      providerDurationMs: expect.any(Number), promptTokens: 201, completionTokens: 115, totalTokens: 316, reasoningTokens: 6,
    }));
    expect(JSON.stringify(events)).not.toMatch(/test-only|Authorization|观察这张工单图片|The window contains an error|Export error|iVBORw0KGgo/);
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
    {
      input: {
        visible_text: ["Label 1", " Label 1 ", null, " ", "X".repeat(240), ...Array.from({ length: 7 }, (_, i) => `Label ${i + 2}`)],
        limitations: [" Visible dialog only ", false, "Y".repeat(600), "ignored tail"],
        extra: "PRIVATE_IGNORED_FIELD",
      },
      visible_text: ["Label 1", "X".repeat(200), "Label 2", "Label 3", "Label 4", "Label 5"],
      limitations: "Visible dialog only；" + "Y".repeat(200) + "；ignored tail",
    },
    {
      input: { visible_text: { bad: true }, limitations: { bad: true } },
      visible_text: [], limitations: "识读范围仅限这张图片中的可见内容。",
    },
    {
      input: {}, visible_text: [], limitations: "识读范围仅限这张图片中的可见内容。",
    },
    {
      input: { limitations: "Z".repeat(800) }, visible_text: [], limitations: "Z".repeat(400),
    },
  ])("retains a valid observation with missing or irregular GLM auxiliary fields %#", async ({ input, visible_text, limitations }) => {
    const { events, options } = captureImageLogs();
    const model = "glm-4.6v";
    const observation = "PRIVATE_DIAL0G: error text from demo@example.com";
    const content = `  \n\`\`\`json\n${JSON.stringify({ observation, ...input })}\n\`\`\` \n`;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ model, choices: [{ message: { content } }] }));
    const result = await invoke(["inspect-image"], {
      ...options, readPrompt: imagePrompt,
      createVisionClient: () => createZcodeChatClient({ model, apiKey: "PRIVATE_KEY", fetchImpl }),
    });
    expect(result).toEqual({ exitCode: 0, errors: [], output: [{
      observation: "PRIVATE_DIAL0G: error text from [EMAIL]", visible_text, limitations, model,
    }] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ phase: "completed", stage: "server.kcs-image.output_validation" });
    expect(JSON.stringify(events)).not.toMatch(/PRIVATE_DIAL0G|PRIVATE_IGNORED_FIELD|PRIVATE_KEY|demo@example.com|iVBORw0KGgo/);
  });

  it.each([
    ["PRIVATE_RESPONSE_TEXT", "glm-4.6v"],
    [JSON.stringify({ observation: "   ", visible_text: ["PRIVATE_RESPONSE_TEXT"] }), "glm-4.6v"],
    [JSON.stringify({ observation: 123 }), "glm-4.6v"],
    [JSON.stringify({ observation: "x".repeat(1201) }), "glm-4.6v"],
    [JSON.stringify({ observation: "PRIVATE_RESPONSE_TEXT", visible_text: [], limitations: "scope" }), "PRIVATE MODEL TEXT"],
    [JSON.stringify({ observation: "PRIVATE_RESPONSE_TEXT", visible_text: [], limitations: "scope" }), "wrong-model"],
  ])("rejects invalid model observations or model identity %#", async (content, responseModel) => {
    const { events, options } = captureImageLogs();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      model: responseModel, choices: [{ message: { content } }],
    }));
    const result = await invoke(["inspect-image"], {
      ...options, readPrompt: imagePrompt,
      createVisionClient: (model) => createZcodeChatClient({ model, apiKey: "PRIVATE_KEY", fetchImpl }),
    });
    expect(result).toMatchObject({ exitCode: 1, output: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ phase: "failed", stage: "server.kcs-image.output_validation", errorCode: "KCS_IMAGE_OUTPUT_INVALID" });
    expect(JSON.stringify(events)).not.toMatch(/PRIVATE_RESPONSE_TEXT|PRIVATE MODEL TEXT|PRIVATE_KEY|iVBORw0KGgo/);
  });

  it("keeps the requested position when one message uses the same Lark image twice", async () => {
    const { db, pool } = await imageDatabase();
    const context = { ...imageLogContext, imageIndex: 2 };
    const { events, options } = captureImageLogs(context);
    try {
      await db.updateTable("lark_ticket_thread_syncs").set({
        messages_json: JSON.stringify({ schemaVersion: 1, messages: [
          { messageId: "m1", messageType: "text", content: "Request: inspect this error" },
          { messageId: "m2", messageType: "post", content: JSON.stringify({
            content: [[{ tag: "img", image_key: "repeated" }, { tag: "img", image_key: "repeated" }]],
          }) },
        ] }),
      }).execute();
      const result = await invoke(["image", scope.base_id, scope.table_id, "images", "m2", "repeated"], {
        ...options, openDatabase: () => db, createImageClient: async () => ({ downloadMessageImage: async () => png }),
      });
      expect(result.exitCode).toBe(0);
      expect(events.at(-1)).toMatchObject({ ...context, phase: "completed", stage: "server.kcs-image.output_validation" });
    } finally {
      await db.destroy();
      await pool.end();
    }
  });

  it.each([
    { media_type: "image/jpeg", data_base64: png.toString("base64") },
    { media_type: "image/png", data_base64: "bm90IGEgcG5n" },
    { media_type: "image/png", data_base64: png.toString("base64") + " " },
    { media_type: "image/png", data_base64: png.toString("base64"), unexpected: "field" },
  ])("rejects image bytes that do not match the vision contract", async (input) => {
    const createVisionClient = vi.fn();
    const { events, options } = captureImageLogs();
    const result = await invoke(["inspect-image"], { ...options, readPrompt: () => JSON.stringify(input), createVisionClient });
    expect(result).toMatchObject({ exitCode: 1, output: [] });
    expect(events.at(-1)).toMatchObject({
      ...imageLogContext, stage: "server.kcs-image.input_validation", phase: "failed", errorCode: "KCS_IMAGE_INPUT_INVALID",
    });
    expect(createVisionClient).not.toHaveBeenCalled();
    expect(result.errors.join("")).not.toContain(input.data_base64);
    expect(JSON.stringify(events)).not.toContain(input.data_base64);
  });

  it.each([
    ["1302", "ZCODE_ACCOUNT_RATE_LIMITED"],
    [1305, "ZCODE_SERVICE_OVERLOADED"],
    ["private-provider-code", "ZCODE_REQUEST_FAILED"],
  ])("logs only the safe GLM classification for status 429 and provider code %s", async (code, errorCode) => {
    const { events, options } = captureImageLogs();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: { code, message: "PRIVATE_RAW_RESPONSE_WITH_SECRET" },
    }), { status: 429 }));
    const result = await invoke(["inspect-image"], {
      ...options, readPrompt: imagePrompt,
      createVisionClient: (model) => createZcodeChatClient({ apiKey: "private-key", model, fetchImpl }),
    });
    expect(result).toMatchObject({ exitCode: 1, output: [] });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({
      ...imageLogContext, phase: "failed", stage: "server.kcs-image.recognition", errorCode, httpStatus: 429,
      providerErrorCode: typeof code === "number" || /^\d+$/.test(code) ? Number(code) : undefined,
    });
    expect(JSON.stringify(events) + result.errors.join("")).not.toMatch(/private-key|private-provider-code|PRIVATE_RAW_RESPONSE_WITH_SECRET/);
  });

  it("logs GLM request timeout with the image location", async () => {
    const { events, options } = captureImageLogs();
    const fetchImpl: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("PRIVATE_TRANSPORT_MESSAGE")), { once: true });
    });
    const result = await invoke(["inspect-image"], {
      ...options, readPrompt: imagePrompt,
      createVisionClient: (model) => createZcodeChatClient({ apiKey: "private-key", model, fetchImpl, timeoutMs: 1 }),
    });
    expect(result).toMatchObject({ exitCode: 1, output: [] });
    expect(events.at(-1)).toMatchObject({
      ...imageLogContext, phase: "failed", stage: "server.kcs-image.recognition", errorCode: "ZCODE_TIMEOUT",
    });
    expect(JSON.stringify(events)).not.toContain("PRIVATE_TRANSPORT_MESSAGE");
  });

  it("logs GLM timeout when a 429 response body stalls", async () => {
    const { events, options } = captureImageLogs();
    const fetchImpl: typeof fetch = async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(new Error("PRIVATE_RESPONSE_STREAM")), {
          once: true,
        });
      },
    }), { status: 429 });
    const result = await invoke(["inspect-image"], {
      ...options, readPrompt: imagePrompt,
      createVisionClient: (model) => createZcodeChatClient({ apiKey: "private-key", model, fetchImpl, timeoutMs: 1 }),
    });
    expect(result).toMatchObject({ exitCode: 1, output: [] });
    expect(events.at(-1)).toMatchObject({
      ...imageLogContext, phase: "failed", stage: "server.kcs-image.recognition",
      errorCode: "ZCODE_TIMEOUT", httpStatus: 429,
    });
    expect(JSON.stringify(events)).not.toContain("PRIVATE_RESPONSE_STREAM");
  });

  it("logs rejected GLM evidence without recording provider text or unknown context fields", async () => {
    const { events, options } = captureImageLogs({ ...imageLogContext, imageKey: "PRIVATE_CONTEXT_IMAGE_KEY" });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      model: "PRIVATE MODEL TEXT", choices: [{ message: { content: "PRIVATE_RESPONSE_TEXT" } }],
    })));
    const result = await invoke(["inspect-image"], {
      ...options, readPrompt: imagePrompt,
      createVisionClient: (model) => createZcodeChatClient({ apiKey: "private-key", model, fetchImpl }),
    });
    expect(result).toMatchObject({ exitCode: 1, output: [] });
    expect(events.at(-1)).toMatchObject({
      phase: "failed", stage: "server.kcs-image.output_validation", errorCode: "KCS_IMAGE_OUTPUT_INVALID", httpStatus: 200,
    });
    expect(events.at(-1)).not.toMatchObject({ actionRunId: imageLogContext.actionRunId });
    expect(JSON.stringify(events)).not.toMatch(/PRIVATE_RESPONSE_TEXT|PRIVATE MODEL TEXT|PRIVATE_CONTEXT_IMAGE_KEY/);
  });

  it("writes complete rotating logs in concurrent CLI children and isolates an unusable log directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "octo-kcs-image-log-"));
    const preload = join(root, "mock-glm.mjs");
    const logDir = join(root, "images");
    const invalidDir = join(root, "regular-file");
    const trace = join(root, "fetch-count");
    const input = join(root, "image-input.json");
    const script = join(dirname(fileURLToPath(import.meta.url)), "ticket-kcs.ts");
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const evidence = { observation: "PRIVATE_OBSERVATION", visible_text: ["PRIVATE_OCR"], limitations: "limits", model: "glm-4.6v" };
    const run = async (imageIndex: number, directory: string) => {
      const stdout = join(root, `stdout-${imageIndex}`);
      const stderr = join(root, `stderr-${imageIndex}`);
      const handles = await Promise.all([open(input, "r"), open(stdout, "w"), open(stderr, "w")]);
      try {
        const exitCode = await new Promise<number | null>((resolve, reject) => {
          const child = spawn(process.execPath, ["--no-deprecation", "--import", tsx, "--import", preload, script, "inspect-image"], {
            cwd: root,
            env: {
              PATH: process.env.PATH, ZCODE_API_KEY: "PRIVATE_API_KEY", KCS_VISION_MODEL: "glm-4.6v",
              KCS_IMAGE_LOG_DIR: directory, KCS_IMAGE_LOG_CONTEXT: JSON.stringify({ ...imageLogContext, imageIndex }),
              LOG_FILE: join(root, "app", "app.log"), API_LOG_FILE: join(root, "app", "api.log"),
            },
            stdio: [handles[0].fd, handles[1].fd, handles[2].fd],
            timeout: 10_000,
          });
          child.once("error", reject);
          child.once("close", resolve);
        });
        return { exitCode, stdout: await readFile(stdout, "utf8"), stderr: await readFile(stderr, "utf8") };
      } finally {
        await Promise.all(handles.map((handle) => handle.close()));
      }
    };
    try {
      await Promise.all([
        writeFile(invalidDir, "ordinary file"),
        writeFile(input, imagePrompt()),
        writeFile(preload, `import { appendFileSync } from "node:fs";
globalThis.fetch = async () => {
  appendFileSync(${JSON.stringify(trace)}, "called\\n");
  return Response.json({ model: "glm-4.6v", choices: [{
    message: { content: ${JSON.stringify(JSON.stringify({
      observation: evidence.observation, visible_text: evidence.visible_text, limitations: evidence.limitations,
    }))} },
  }] });
};
`),
      ]);
      const results = await Promise.all([1, 2, 3].map((index) => run(index, logDir)));
      expect(results).toEqual(Array.from({ length: 3 }, () => ({ exitCode: 0, stdout: JSON.stringify(evidence) + "\n", stderr: "" })));
      const logs = await readdir(logDir);
      expect(logs).toEqual([expect.stringMatching(/^kcs-images\.\d{4}-\d{2}-\d{2}\.\d+\.log$/)]);
      const raw = await readFile(join(logDir, logs[0]), "utf8");
      const events = raw.trim().split("\n").map((line) => JSON.parse(line));
      expect(events).toHaveLength(24);
      for (const imageIndex of [1, 2, 3]) {
        const phases = events.filter((event) => event.imageIndex === imageIndex);
        expect(phases.map((event) => event.phase)).toEqual(["start", "completed", "start", "completed", "start", "completed", "start", "completed"]);
        expect(phases.at(-1)).toMatchObject({ ...imageLogContext, imageIndex, sha256: pngSha256 });
      }
      expect(raw).not.toMatch(/PRIVATE_OBSERVATION|PRIVATE_OCR|PRIVATE_API_KEY|Authorization|iVBORw0KGgo/);
      expect(await run(4, invalidDir)).toEqual({
        exitCode: 0, stdout: JSON.stringify(evidence) + "\n", stderr: "KCS_IMAGE_LOG_WRITE_FAILED\n",
      });
      expect(await readFile(trace, "utf8")).toBe("called\n".repeat(4));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});
