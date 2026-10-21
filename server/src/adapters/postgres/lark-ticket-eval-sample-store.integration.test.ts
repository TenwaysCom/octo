import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql, type Kysely } from "kysely";
import { createPostgresDatabase, ensurePostgresSchema } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import { PostgresPlatformSyncStore } from "./platform-sync-store.js";
import { PostgresLarkTicketThreadSyncStore } from "./lark-ticket-thread-sync-store.js";
import { PostgresLarkTicketEvalSampleStore, withShadowEvalSourceLock } from "./lark-ticket-eval-sample-store.js";
import { createLarkTicketEvalDatasetService } from "../../application/services/lark-ticket-eval-dataset.service.js";

// Only a disposable, explicitly selected test database is allowed. Never fall back to the app DB.
const uri = process.env.OCTO_EVAL_TEST_POSTGRES_URI;
const run = uri ? describe : describe.skip;
run("Shadow Eval / isolated PostgreSQL integration", () => {
  let db: Kysely<DatabaseSchema>;
  const alice = { id: "alice", name: "Alice" }, bob = { id: "bob", name: "Bob" };
  const stores = (connection = db) => ({ syncStore: new PostgresPlatformSyncStore(connection),
    threadStore: new PostgresLarkTicketThreadSyncStore(connection), sampleStore: new PostgresLarkTicketEvalSampleStore(connection) });
  const service = () => createLarkTicketEvalDatasetService({ ...stores(), shadowTransaction: (ref, work) =>
    withShadowEvalSourceLock(ref, (trx) => work(stores(trx)), db) });

  beforeAll(async () => {
    const url = new URL(uri!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/octo_eval_test')) throw new Error("Use a disposable local octo_eval_test database.");
    db = createPostgresDatabase(uri!);
    // Start with the pre-change schema so this checks the actual upgrade path, not just a fresh install.
    await sql`CREATE TABLE IF NOT EXISTS lark_ticket_eval_samples (
      id text PRIMARY KEY, base_id text NOT NULL, table_id text NOT NULL, record_id text NOT NULL,
      ticket_title text NOT NULL, snapshot_version integer NOT NULL, ai_output_json text NOT NULL,
      dataset_status text NOT NULL, manual_intent text, expected_outcome text, notes text,
      failure_labels_json text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL,
      CONSTRAINT lark_ticket_eval_samples_ticket_snapshot UNIQUE (base_id, table_id, record_id, snapshot_version)
    )`.execute(db);
    await sql`INSERT INTO lark_ticket_eval_samples (id, base_id, table_id, record_id, ticket_title, snapshot_version,
      ai_output_json, dataset_status, notes, failure_labels_json, created_at, updated_at)
      VALUES ('legacy-migration', 'legacy', 'table', 'record', 'Original', 1, '{"AI意图":"原意图"}', 'badcase', '原备注', '["fact_incorrect"]', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
      ON CONFLICT (id) DO NOTHING`.execute(db);
    await ensurePostgresSchema(db);
    await ensurePostgresSchema(db);
  }, 30_000);
  afterAll(async () => { await db?.destroy(); });

  async function fixture() {
    const ref = { baseId: "eval-test", tableId: "table", recordId: randomUUID() };
    const { syncStore, threadStore } = stores();
    await syncStore.upsertLarkBaseTicket({ ...ref, record: { record_id: ref.recordId, fields: {} }, title: "Synthetic Ticket", status: "Open" });
    await threadStore.saveSuccessfulSync({ ...ref, messageLink: "https://example.com/thread", threadId: "thread", messages: [{ messageId: "message", messageType: "text", content: '{"text":"测试问题"}' }], historyComplete: true, checkedAt: "2026-10-21T00:00:00.000Z" });
    const shadow = { status: "ok", analyzedAt: "2026-10-21T01:00:00.000Z", snapshotVersion: 1, summary: "冻结的问题" };
    await syncStore.upsertLarkBaseTicketShadowAi({ ...ref, shadow });
    const context = await service().loadShadow({ ticket: ref, reviewerId: alice.id });
    const request = { baseId: ref.baseId, tableId: ref.tableId, outputVersion: context.outputVersion!, actionRunId: randomUUID(),
      datasetStatus: "badcase" as const, failureLabels: ["fact_incorrect" as const], notes: "环境错误" };
    return { ref, shadow, request };
  }

  it("migrates idempotently without reclassifying or rewriting old annotations", async () => {
    expect(await stores().sampleStore.get("legacy-migration", alice.id)).toMatchObject({ source: "legacy", outputVersion: "", notes: "原备注", aiOutput: { "AI意图": "原意图" }, datasetStatus: "badcase" });
  });

  it("serializes simultaneous first saves and rejects the losing operator", async () => {
    const { ref, request } = await fixture();
    const results = await Promise.allSettled([
      service().createShadow({ ticket: ref, request, reviewer: alice }),
      service().createShadow({ ticket: ref, request: { ...request, actionRunId: randomUUID() }, reviewer: bob }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "EVAL_SAMPLE_CONFLICT" } });
    const samples = await stores().sampleStore.list(alice.id, false, ref);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ datasetStatus: "badcase", notes: "环境错误", source: "shadow" });
    expect(await db.selectFrom("lark_ticket_eval_reviews").selectAll().where("sample_id", "=", samples[0]!.id).execute()).toHaveLength(1);
  });

  it("rejects stale edits across connections and returns current state on committed replay", async () => {
    const { ref, request } = await fixture();
    const first = await service().createShadow({ ticket: ref, request, reviewer: alice });
    const update = { actionRunId: randomUUID(), expectedUpdatedAt: first.updatedAt, datasetStatus: "badcase" as const, notes: "新原因", failureLabels: ["fact_incorrect" as const] };
    const results = await Promise.allSettled([
      service().update({ id: first.id, update, reviewer: alice }),
      service().update({ id: first.id, update: { ...update, actionRunId: randomUUID(), notes: "另一原因" }, reviewer: bob }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "EVAL_SAMPLE_CONFLICT" } });
    const current = await stores().sampleStore.get(first.id, alice.id);
    expect(await service().createShadow({ ticket: ref, request, reviewer: alice })).toEqual(current);
  });

  it("preserves old results and starts a new unmarked version on the same thread snapshot", async () => {
    const { ref, shadow, request } = await fixture();
    const old = await service().createShadow({ ticket: ref, request, reviewer: alice });
    await stores().syncStore.upsertLarkBaseTicketShadowAi({ ...ref, shadow: { ...shadow, analyzedAt: "2026-10-21T02:00:00.000Z", summary: "新问题" } });
    const next = await service().loadShadow({ ticket: ref, reviewerId: alice.id });
    expect(next.sample).toBeNull();
    await expect(service().createShadow({ ticket: ref, request: { ...request, actionRunId: randomUUID() }, reviewer: bob })).rejects.toMatchObject({ code: "EVAL_SAMPLE_CONFLICT" });
    const created = await service().createShadow({ ticket: ref, request: { ...request, outputVersion: next.outputVersion!, actionRunId: randomUUID(), datasetStatus: "eval" }, reviewer: alice });
    expect(created.id).not.toBe(old.id);
    expect(created.snapshotVersion).toBe(old.snapshotVersion);
    expect((await stores().sampleStore.get(old.id, alice.id))?.aiOutput.shadowAi).toMatchObject({ summary: "冻结的问题" });
    expect(await service().update({ id: old.id, update: { actionRunId: randomUUID(), expectedUpdatedAt: old.updatedAt, datasetStatus: "eval", notes: old.notes, failureLabels: old.failureLabels as ["fact_incorrect"] }, reviewer: bob }))
      .toMatchObject({ datasetStatus: "eval", notes: "环境错误" });
  });

  it("rejects changed output before first save and rolls back if audit insertion fails", async () => {
    const { ref, shadow, request } = await fixture();
    await stores().syncStore.upsertLarkBaseTicketShadowAi({ ...ref, shadow: { ...shadow, summary: "改变了" } });
    await expect(service().createShadow({ ticket: ref, request, reviewer: alice })).rejects.toMatchObject({ code: "SHADOW_OUTPUT_CHANGED" });
    expect(await stores().sampleStore.list(alice.id, false, ref)).toHaveLength(0);
    await stores().syncStore.upsertLarkBaseTicketShadowAi({ ...ref, shadow });
    await sql`CREATE OR REPLACE FUNCTION reject_eval_test_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action_run_id = 'reject-eval-test-review' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`.execute(db);
    await sql`CREATE TRIGGER reject_eval_test_review BEFORE INSERT ON lark_ticket_eval_reviews FOR EACH ROW EXECUTE FUNCTION reject_eval_test_review()`.execute(db);
    try {
      await expect(service().createShadow({ ticket: ref, request: { ...request, actionRunId: "reject-eval-test-review" }, reviewer: alice })).rejects.toThrow("synthetic audit failure");
      expect(await stores().sampleStore.list(alice.id, false, ref)).toHaveLength(0);
    } finally {
      await sql`DROP TRIGGER reject_eval_test_review ON lark_ticket_eval_reviews`.execute(db);
      await sql`DROP FUNCTION reject_eval_test_review()`.execute(db);
    }
  });

  it("holds the source row through validation and sample commit", async () => {
    const { ref, shadow, request } = await fixture();
    let unlock!: () => void, locked!: () => void;
    const release = new Promise<void>((resolve) => { unlock = resolve; });
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const controlled = createLarkTicketEvalDatasetService({ ...stores(), shadowTransaction: (ticket, work) =>
      withShadowEvalSourceLock(ticket, async (trx) => { locked(); await release; return work(stores(trx)); }, db) });
    const saving = controlled.createShadow({ ticket: ref, request, reviewer: alice });
    await ready;
    let written = false;
    const writer = stores().syncStore.upsertLarkBaseTicketShadowAi({ ...ref, shadow: { ...shadow, summary: "更新后的问题" } }).then(() => { written = true; });
    try { await delay(80); expect(written).toBe(false); }
    finally { unlock(); }
    expect((await saving).aiOutput.shadowAi).toMatchObject({ summary: "冻结的问题" });
    await writer;
    expect((await service().loadShadow({ ticket: ref, reviewerId: alice.id })).sample).toBeNull();
  });
});
