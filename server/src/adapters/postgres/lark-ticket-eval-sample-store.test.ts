import { PostgresPlatformSyncStore } from "./platform-sync-store.js";
import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresLarkTicketEvalSampleStore } from "./lark-ticket-eval-sample-store.js";
import { updateLarkTicketEvalSampleSchema } from "../../domain/lark-ticket-eval-sample.js";

it("allows unannotated draft/eval, requires a badcase label and rejects forged reviewer metadata", () => {
  for (const datasetStatus of ["draft", "eval"]) expect(updateLarkTicketEvalSampleSchema.safeParse({ datasetStatus, actionRunId: "r" }).success).toBe(true);
  expect(updateLarkTicketEvalSampleSchema.safeParse({ datasetStatus: "badcase", actionRunId: "r" }).success).toBe(false);
  expect(updateLarkTicketEvalSampleSchema.safeParse({ datasetStatus: "badcase", actionRunId: "r", failureLabels: ["fact_incorrect"] }).success).toBe(true);
  expect(updateLarkTicketEvalSampleSchema.safeParse({ datasetStatus: "eval", actionRunId: "r", reviewerId: "forged" }).success).toBe(false);
});

it("persists draft reviews, retains both reviewers and ignores replay after another user's save", async () => {
  const { db } = await createTestPostgresDatabase();
  try {
    const store = new PostgresLarkTicketEvalSampleStore(db);
    const alice = { id: "a", name: "Alice" }, bob = { id: "b", name: "Bob" };
    const timestamp = "2026-09-21T01:00:00.000Z";
    const sample = { id: "s", ticket: { baseId: "base", tableId: "table", recordId: "rec", title: "Example" }, snapshotVersion: 1,
      aiOutput: {}, datasetStatus: "eval" as const, failureLabels: [], createdAt: timestamp, updatedAt: timestamp };
    expect(await store.create(sample, alice, "create")).toMatchObject({ evalBy: "Alice", evalAt: timestamp, isMyEval: true });
    const draft = updateLarkTicketEvalSampleSchema.parse({ datasetStatus: "draft", actionRunId: "draft" });
    expect(await store.update("s", draft, timestamp, alice)).toMatchObject({ datasetStatus: "draft", evalBy: "Alice" });
    const bobSave = await store.update("s", { ...draft, datasetStatus: "badcase", failureLabels: ["fact_incorrect"], actionRunId: "bad" }, timestamp, bob);
    expect(bobSave).toMatchObject({ evalBy: "Bob", datasetStatus: "badcase" });
    expect(await store.update("s", draft, timestamp, alice)).toMatchObject({ evalBy: "Bob", datasetStatus: "badcase", evalAt: bobSave!.evalAt });
    expect(await store.list("a", true)).toEqual([expect.objectContaining({ id: "s", isMyEval: true, evalBy: "Bob" })]);
    expect(await store.list("b", true)).toHaveLength(1);
    expect(await store.list("c", true)).toHaveLength(0);
    expect(await db.selectFrom("lark_ticket_eval_reviews").selectAll().execute()).toHaveLength(3);
    // Legacy samples have timestamps but no reviewer; do not infer a review from updated_at.
    await db.deleteFrom("lark_ticket_eval_reviews").execute();
    expect(await store.list("a")).toEqual([expect.objectContaining({ id: "s", evalAt: undefined, evalBy: undefined, isMyEval: false })]);
    expect(await store.list("a", true)).toHaveLength(0);
  } finally { await db.destroy(); }
});

it("filters My evals before pagination and counts each ticket once across reviews and snapshots", async () => {
  const { db } = await createTestPostgresDatabase();
  try {
    const tickets = new PostgresPlatformSyncStore(db);
    const samples = new PostgresLarkTicketEvalSampleStore(db);
    for (const recordId of ["one", "two", "other"]) {
      const ticket = { baseId: "base", tableId: "table", recordId };
      await tickets.upsertLarkBaseTicket({ ...ticket, record: { record_id: recordId, fields: {} }, title: recordId, status: "Open" });
      for (const snapshotVersion of [1, 2]) {
        await samples.create({ id: `${recordId}-${snapshotVersion}`, ticket: { ...ticket, title: recordId }, snapshotVersion,
          aiOutput: {}, datasetStatus: "draft", failureLabels: [], createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" },
        { id: recordId === "other" ? "b" : "a", name: "Reviewer" }, `create-${recordId}-${snapshotVersion}`);
      }
    }
    const filters = { quickFilter: "my-evals" as const, evalReviewerId: "a" };
    expect(await tickets.countLarkBaseTickets(filters)).toBe(2);
    const first = await tickets.listLarkBaseTickets(1, filters);
    const second = await tickets.listLarkBaseTickets(1, { ...filters, offset: 1 });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(new Set([first[0]!.recordId, second[0]!.recordId])).toEqual(new Set(["one", "two"]));
    expect(await tickets.countLarkBaseTickets({ quickFilter: "my-evals" })).toBe(0);
  } finally { await db.destroy(); }
});
