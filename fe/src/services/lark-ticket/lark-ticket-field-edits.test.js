import assert from "node:assert/strict";
import test from "node:test";
import { createLarkTicketFieldEdits } from "./lark-ticket-field-edits.js";

const ticket = { baseId: "base", tableId: "table", recordId: "record", ticketStatus: "Open", priority: "P2", responsible: "Ada", responsiblePeople: [{ name: "Ada", userId: "ou_ada", avatarUrl: "https://example.com/ada.png" }], solution: "old" };
function scheduler() {
  let time = 0, id = 0;
  const tasks = new Map();
  return { now: () => time, setTimer: (fn, ms) => { tasks.set(++id, { fn, at: time + ms }); return id; }, clearTimer: (key) => tasks.delete(key),
    advance(ms) { const target = time + ms; while (true) { const next = [...tasks].sort((a, b) => a[1].at - b[1].at).find(([, t]) => t.at <= target); if (!next) break; tasks.delete(next[0]); time = next[1].at; next[1].fn(); } time = target; } };
}
const valuesFor = (target) => Object.fromEntries(Object.entries({ status: "ticketStatus", priority: "priority", requester: "requester", responsible: "responsible", issueType: "issueType", businessLine: "businessLine" })
  .map(([field, key]) => [field, { value: target[key] || "", ...(["requester", "responsible"].includes(field) ? { userIds: (target[`${field}People`] || []).map((p) => p.userId) } : {}) }]));
const memoryStorage = () => { const entries = new Map(); return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) }; };
function fixture(autoFlush = true, extra = {}) {
  const clock = scheduler(), requests = [], creates = [], patches = [], queries = [], reconciles = [], syncs = [];
  const edits = createLarkTicketFieldEdits({ apiBaseUrl: "/api", masterUserId: "user", ...clock, storage: memoryStorage(),
    onPatch: (patch) => patches.push(patch),
    createMeegle: (input) => new Promise((resolve, reject) => creates.push({ input, resolve, reject })),
    update: (input) => new Promise((resolve, reject) => requests.push({ input, resolve, reject })),
    updateFields: (input) => new Promise((resolve, reject) => requests.push({ input, resolve: (value = {}) => resolve({ state: "saved", larkBaseUpdated: true, ...value }), reject })),
    getSubmission: (input) => new Promise((resolve, reject) => queries.push({ input, resolve, reject })),
    reconcile: (input) => new Promise((resolve, reject) => reconciles.push({ input, resolve, reject })),
    retrySync: (input) => new Promise((resolve, reject) => syncs.push({ input, resolve, reject })),
    loadSnapshot: async () => ({ ticket, values: valuesFor(ticket) }), ...extra });
  const submit = (field, value, target = ticket, optionUserId) => {
    const done = edits.submit({ ticket: target, field, value, optionUserId }); done.catch(() => {});
    if (autoFlush) clock.advance(1000);
    return done;
  };
  return { edits, requests, patches, submit, creates, clock, queries, reconciles, syncs };
}
const turn = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("last selection wins, three changed fields share one request after one second, and reverting removes no-ops", async () => {
  const f = fixture(false);
  const a = f.submit("priority", "P1"), b = f.submit("priority", "P0");
  f.clock.advance(500);
  const c = f.submit("responsible", "Lin", f.edits.project(ticket), "ou_lin");
  const d = f.submit("status", "Finish", f.edits.project(ticket));
  assert.equal(f.edits.project(ticket).priority, "P0");
  assert.equal(f.edits.project(ticket).responsiblePeople[0].userId, "ou_lin");
  f.clock.advance(999); assert.equal(f.requests.length, 0);
  f.clock.advance(1); assert.equal(f.requests.length, 1);
  assert.deepEqual(f.requests[0].input.changes.map((v) => [v.field, v.value]), [["priority", "P0"], ["responsible", "Lin"], ["status", "Finish"]]);
  assert.deepEqual(f.requests[0].input.changes[1].expected.userIds, ["ou_ada"]);
  f.requests[0].resolve({ ticket: { priority: "P0", responsible: "Lin", ticketStatus: "Finish", closedAt: "2026-11-06T00:00:00Z", solution: "stale" } });
  await Promise.all([a, b, c, d]);
  assert.equal(f.edits.project(ticket).solution, "old");
  assert.equal(f.edits.project(ticket).closedAt, "2026-11-06T00:00:00Z");
  const e = f.submit("priority", "P1", f.edits.project(ticket));
  const reverted = f.submit("priority", "P0", f.edits.project(ticket));
  await Promise.all([e, reverted]); f.clock.advance(3000);
  assert.equal(f.requests.length, 1);
  assert.equal(f.patches.at(-1).priority, "P0");
});

test("reverting to the initial value restores navigation patches without sending", async () => {
  const f = fixture(false);
  const a = f.submit("priority", "P0"), b = f.submit("priority", "P2", f.edits.project(ticket));
  await Promise.all([a, b]); f.clock.advance(3000);
  assert.equal(f.requests.length, 0); assert.equal(f.patches.at(-1).priority, "P2");
});

test("continuous editing has a maximum three-second wait", async () => {
  const f = fixture(false);
  const done = [];
  for (let i = 0; i < 6; i++) { done.push(f.submit("priority", `P${i + 3}`)); f.clock.advance(500); }
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].input.changes[0].value, "P8");
  f.requests[0].resolve(); await Promise.all(done);
});

test("in-flight edits form the next immutable batch and old projections cannot overwrite them", async () => {
  const f = fixture(false);
  const a = f.submit("priority", "P0"); f.clock.advance(1000);
  const oldId = f.requests[0].input.submissionId;
  const b = f.submit("priority", "P1", f.edits.project(ticket));
  const c = f.submit("responsible", "Lin", f.edits.project(ticket), "ou_lin");
  f.clock.advance(3000); assert.equal(f.requests.length, 1);
  f.requests[0].resolve({ ticket: { priority: "P0", responsible: "stale" } }); await a;
  assert.equal(f.edits.project(ticket).priority, "P1");
  assert.equal(f.edits.project(ticket).responsible, "Lin");
  f.clock.advance(0);
  assert.equal(f.requests.length, 2); assert.notEqual(f.requests[1].input.submissionId, oldId);
  assert.deepEqual(f.requests[1].input.changes[0].expected, { value: "P0" });
  f.requests[1].resolve(); await Promise.all([b, c]);
});

test("an explicit refusal retains drafts, person identity and avatar changes; other Tickets still save", async () => {
  const f = fixture();
  const a = f.submit("responsible", "Lin", ticket, "ou_lin");
  f.requests[0].resolve({ state: "rejected", larkBaseUpdated: false, errorCode: "LARK_TICKET_SOURCE_FORBIDDEN", errorMessage: "无权限" });
  await assert.rejects(a, /无权限/);
  assert.equal(f.edits.project(ticket).responsible, "Lin");
  assert.deepEqual(f.edits.project(ticket).responsiblePeople, [{ name: "Lin", userId: "ou_lin" }]);
  f.clock.advance(5000); assert.equal(f.requests.length, 1);
  const b = f.submit("priority", "P0", { ...ticket, tableId: "other" });
  f.requests[1].resolve(); await b;
  assert.equal(f.edits.status(ticket).pending, 1);
});

test("conflicts display both values and require explicit local/remote choice", async () => {
  const f = fixture();
  const a = f.submit("priority", "P0");
  f.requests[0].resolve({ state: "conflict", larkBaseUpdated: false, conflicts: ["priority"], values: { priority: { value: "P3" } }, errorMessage: "冲突" });
  await assert.rejects(a, /冲突/);
  assert.equal(f.edits.status(ticket).entries[0].remote.priority.value, "P3");
  f.edits.resolveConflict(ticket, "local"); f.clock.advance(1000);
  assert.deepEqual(f.requests[1].input.changes[0].expected, { value: "P3" });
  f.requests[1].resolve({ state: "conflict", larkBaseUpdated: false, conflicts: ["priority"], values: { priority: { value: "P4" } } }); await turn();
  f.edits.resolveConflict(ticket, "remote");
  assert.equal(f.edits.project(ticket).priority, "P4");
  assert.equal(f.edits.status(ticket).pending, 0);
});

test("partial success keeps the saved identity, clears write drafts and only retries sync", async () => {
  const f = fixture();
  const a = f.submit("responsible", "Lin", ticket, "ou_lin");
  f.requests[0].resolve({ state: "saved_pending_sync", syncFailed: true }); await a;
  assert.equal(f.edits.status(ticket).pending, 0);
  assert.equal(f.edits.status(ticket).entries[0].syncCount, 1);
  f.edits.accept([ticket], f.edits.getVersion());
  assert.equal(f.edits.project(ticket).responsible, "Lin");
  const retry = f.edits.retrySync(ticket);
  f.syncs[0].resolve({ state: "saved" }); await retry;
  assert.equal(f.requests.length, 1); assert.equal(f.edits.status(ticket).entries[0].syncCount, 0);
});

test("timeout queries the immutable ID, reads back, pauses only that Ticket and allows draft edits", async () => {
  const f = fixture();
  const a = f.submit("priority", "P0");
  f.requests[0].reject(new Error("timeout")); await assert.rejects(a);
  assert.equal(f.queries[0].input.submissionId, f.requests[0].input.submissionId);
  f.queries[0].resolve({ state: "unknown" }); await turn();
  f.reconciles[0].resolve({ state: "unknown", errorMessage: "结果未知" }); await turn();
  const b = f.submit("priority", "P1", f.edits.project(ticket));
  assert.equal(f.edits.project(ticket).priority, "P1"); assert.equal(f.requests.length, 1);
  const check = f.edits.recheck(ticket);
  f.queries[1].resolve({ state: "saved", larkBaseUpdated: true, ticket: { priority: "P0" } }); await check;
  assert.equal(f.edits.project(ticket).priority, "P1");
  f.clock.advance(1000); f.requests[1].resolve(); await b;
});

test("missing server receipt reuses the same ID instead of creating another write", async () => {
  const f = fixture();
  const a = f.submit("priority", "P0"); f.requests[0].reject(new Error("lost")); await assert.rejects(a);
  f.queries[0].reject(Object.assign(new Error("not found"), { code: "TICKET_SUBMISSION_NOT_FOUND" })); await turn();
  assert.equal(f.requests[1].input.submissionId, f.requests[0].input.submissionId);
  assert.deepEqual(f.requests[1].input.changes, f.requests[0].input.changes);
  f.requests[1].resolve(); await turn();
});

test("fresh-read barriers protect late reads but allow later external changes", async () => {
  const f = fixture();
  const before = f.edits.getVersion(), a = f.submit("priority", "P0"), during = f.edits.getVersion();
  f.requests[0].resolve(); await a;
  for (const version of [before, during]) { f.edits.accept([ticket], version); assert.equal(f.edits.project(ticket).priority, "P0"); }
  const fresh = { ...ticket, priority: "P3" };
  f.edits.accept([fresh], f.edits.getVersion()); assert.equal(f.edits.project(fresh).priority, "P3");
});

test("refresh restores drafts only after fresh source comparison, and an account change never resumes another user's queue", async () => {
  const storage = memoryStorage();
  const f = fixture(false, { storage }); f.edits.retain();
  const a = f.submit("priority", "P0"); f.edits.dispose(); await assert.rejects(a);
  let fresh;
  const g = fixture(false, { storage, loadSnapshot: () => new Promise((resolve) => { fresh = resolve; }) });
  g.edits.retain(); g.clock.advance(5000); assert.equal(g.requests.length, 0);
  assert.equal(g.edits.project(ticket).priority, "P0");
  fresh({ ticket, values: valuesFor(ticket) }); await turn();
  g.clock.advance(1000); assert.equal(g.requests.length, 1);
  g.edits.dispose();
  const h = fixture(false, { storage, masterUserId: "another-user" }); h.edits.retain(); await turn(); h.clock.advance(5000);
  assert.equal(h.requests.length, 0); assert.equal(h.edits.project(ticket).priority, "P2");
  assert.equal(storage.getItem("octo:ticket-drafts:v1:/api:user"), null);
});

test("refresh detects changed remote fields before resuming and recovers submitted batches before unsent drafts", async () => {
  const storage = memoryStorage();
  const f = fixture(false, { storage }); f.edits.retain(); const a = f.submit("priority", "P0"); f.edits.dispose(); await assert.rejects(a);
  const changed = { ...ticket, priority: "P3" };
  const g = fixture(false, { storage, loadSnapshot: async () => ({ ticket: changed, values: valuesFor(changed) }) });
  g.edits.retain(); await turn(); g.clock.advance(5000);
  assert.equal(g.requests.length, 0); assert.equal(g.edits.status(ticket).entries[0].phase, "conflict");
  g.edits.resolveConflict(ticket, "local"); g.clock.advance(1000);
  const id = g.requests[0].input.submissionId; g.edits.dispose();
  const h = fixture(false, { storage }); h.edits.retain(); await turn();
  assert.equal(h.queries[0].input.submissionId, id); assert.equal(h.requests.length, 0);
  h.queries[0].resolve({ state: "saved", larkBaseUpdated: true, ticket: { priority: "P0" } }); await turn();
  assert.equal(h.edits.project(ticket).priority, "P0");
});

test("missing source preserves drafts, blocks edits, and deletion still deduplicates and guards unsaved work", async () => {
  const f = fixture(false);
  const a = f.submit("priority", "P0");
  await assert.rejects(f.edits.markDeleted({ ticket }), /等待当前操作/);
  f.edits.reportSourceError(ticket, Object.assign(new Error("源记录不存在"), { code: "LARK_TICKET_SOURCE_NOT_FOUND" }));
  await assert.rejects(a); f.clock.advance(5000); assert.equal(f.requests.length, 0);
  assert.equal(f.edits.project(ticket).priority, "P0"); assert.equal(f.edits.status(ticket).blocked, true);
  await assert.rejects(f.submit("status", "Finish"), /暂停修改/);
  f.edits.discardDraft(ticket);
  assert.equal(f.edits.status(ticket).pending, 0);
  assert.equal(f.edits.project(ticket).priority, "P2");
  const deletions = [];
  const g = fixture(false, { markDeleted: (input) => new Promise((resolve) => deletions.push({ input, resolve })) });
  const first = g.edits.markDeleted({ ticket }); assert.equal(g.edits.markDeleted({ ticket }), first); await turn();
  deletions[0].resolve({ deletedAt: "2026-11-06T00:00:00Z" }); await first;
  assert.equal(g.edits.project(ticket).deletedAt, "2026-11-06T00:00:00Z");
});

test("StrictMode effect replay retains the queue; logout discards unsent drafts and suppresses late results", async () => {
  const f = fixture(false); const release = f.edits.retain(); release(); f.edits.retain(); await turn();
  const a = f.submit("priority", "P0"); f.clock.advance(1000);
  const b = f.submit("status", "Finish");
  const patchCount = f.patches.length;
  f.edits.dispose({ discardDrafts: true }); await Promise.all([assert.rejects(a), assert.rejects(b)]);
  f.requests[0].resolve(); await turn();
  assert.equal(f.patches.length, patchCount); assert.equal(f.requests.length, 1);
});

test("explicit solution saves keep the old endpoint and cannot overlap property batches", async () => {
  const f = fixture(false);
  const a = f.submit("priority", "P0");
  await assert.rejects(f.submit("solution", "new"), /等待属性/);
  f.clock.advance(1000); f.requests[0].resolve(); await a;
  const b = f.submit("solution", ""); assert.equal(f.requests[1].input.field, "solution");
  f.requests[1].resolve({ ticket: { solution: "" } }); await b;
  assert.equal(f.edits.project(ticket).solution, "");
});
test("creation shares one request across navigation and retains all successful links despite late reads", async () => {
  const { edits, creates, patches } = fixture();
  const first = edits.createMeegle({ ticket, actionRunId: "create1" });
  assert.strictEqual(first, edits.createMeegle({ ticket, actionRunId: "create2" }));
  assert.equal(edits.creationStatus(ticket).status, "running");
  const readVersion = edits.getVersion();
  await Promise.resolve();
  assert.equal(creates.length, 1);
  assert.equal(creates[0].input.actionRunId, "create1");
  const result = { workitemId: "wi1", meegleLink: "https://example.com/wi1", workitems: [
    { workitemId: "wi1", meegleLink: "https://example.com/wi1" }, { workitemId: "wi2", meegleLink: "https://example.com/wi2" },
  ] };
  creates[0].resolve(result);
  await first;
  const links = "https://example.com/wi1\nhttps://example.com/wi2";
  assert.equal(edits.project(ticket).meegleLink, links);
  assert.equal(patches.at(-1).meegleLink, links);
  edits.accept([ticket], readVersion);
  assert.equal(edits.project(ticket).meegleLink, links);
  assert.deepEqual(await edits.createMeegle({ ticket }), result);
  assert.equal(creates.length, 1);
});

test("creation waits for pending attributes and prevents concurrent writes on the same Ticket only", async () => {
  const { edits, creates, requests, submit } = fixture();
  const write = submit("issueType", "Feature");
  await assert.rejects(edits.createMeegle({ ticket }), /属性保存/);
  assert.equal(creates.length, 0);
  requests[0].resolve({ ticket: { issueType: "Feature" } });
  await write;
  const create = edits.createMeegle({ ticket });
  await Promise.resolve();
  await assert.rejects(submit("priority", "P0"), /未发送/);
  assert.equal(requests.length, 1);
  const other = { ...ticket, tableId: "other" };
  const otherWrite = submit("priority", "P0", other);
  requests[1].resolve({ ticket: { priority: "P0" } });
  await otherWrite;
  creates[0].resolve({ workitemId: "wi1", meegleLink: "https://example.com/wi1", syncFailed: true });
  await create;
  edits.accept([ticket], edits.getVersion());
  assert.equal(edits.project(ticket).meegleLink, "https://example.com/wi1");
  assert.equal(edits.creationStatus(ticket).result.syncFailed, true);
});

test("creation errors do not fabricate links or automatically retry, and existing links prevent another create", async () => {
  const { edits, creates } = fixture();
  const done = edits.createMeegle({ ticket });
  await Promise.resolve();
  creates[0].reject(Object.assign(new Error("already linked"), { code: "MEEGLE_LINK_ALREADY_EXISTS" }));
  await assert.rejects(done);
  assert.equal(edits.project(ticket).meegleLink, undefined);
  assert.match(edits.creationStatus(ticket).message, /已有 Meegle 链接/);
  await assert.rejects(edits.createMeegle({ ticket }), /无需重复创建/);
  await assert.rejects(edits.createMeegle({ ticket: { ...ticket, tableId: "other", meegleLink: "https://example.com/existing" } }), /无需重复创建/);
  assert.equal(creates.length, 1);
});

test("failed creation releases the guard for an explicit retry without leaking errors to other Tickets", async () => {
  const { edits, creates } = fixture();
  const done = edits.createMeegle({ ticket });
  await Promise.resolve();
  creates[0].reject(new Error("authorization required"));
  await assert.rejects(done);
  assert.equal(edits.creationStatus({ ...ticket, recordId: "other" }).status, "idle");
  const retry = edits.createMeegle({ ticket });
  await Promise.resolve();
  assert.equal(creates.length, 2);
  creates[1].resolve({ workitemId: "wi1", meegleLink: "https://example.com/wi1" });
  await retry;
  assert.equal(edits.creationStatus(ticket).status, "done");
});

test("logout cancels an unsent create and suppresses an in-flight creation's late projection", async () => {
  const unsent = fixture();
  const cancelled = unsent.edits.createMeegle({ ticket });
  unsent.edits.dispose();
  await assert.rejects(cancelled, /未发送创建请求/);
  assert.equal(unsent.creates.length, 0);
  const sent = fixture();
  const pending = sent.edits.createMeegle({ ticket });
  await Promise.resolve();
  sent.edits.dispose();
  const patchCount = sent.patches.length;
  sent.creates[0].resolve({ workitemId: "wi1", meegleLink: "https://example.com/wi1" });
  await pending;
  assert.equal(sent.patches.length, patchCount);
  assert.equal(sent.edits.project(ticket).meegleLink, undefined);
});

test("failed deletion remains retryable and does not hide the source Ticket", async () => {
  let count = 0;
  const f = fixture(false, { markDeleted: async () => { if (++count === 1) throw new Error("synthetic failure"); return { deletedAt: "2026-11-06T00:00:00Z" }; } });
  await assert.rejects(f.edits.markDeleted({ ticket }), /synthetic failure/);
  assert.equal(f.edits.project(ticket).deletedAt, undefined);
  await f.edits.markDeleted({ ticket });
  assert.equal(count, 2); assert.equal(f.edits.project(ticket).deletedAt, "2026-11-06T00:00:00Z");
});

test("discarding a rejected person draft restores the confirmed person and avatar, and unknown batches cannot be discarded", async () => {
  const f = fixture();
  const a = f.submit("responsible", "Lin", ticket, "ou_lin");
  f.requests[0].resolve({ state: "rejected", larkBaseUpdated: false }); await assert.rejects(a);
  f.edits.discardDraft(ticket);
  assert.equal(f.edits.project(ticket).responsible, "Ada");
  assert.deepEqual(f.edits.project(ticket).responsiblePeople, ticket.responsiblePeople);
  const b = f.submit("priority", "P0");
  f.requests[1].resolve({ state: "unknown", larkBaseUpdated: false }); await assert.rejects(b);
  f.edits.discardDraft(ticket); assert.equal(f.edits.status(ticket).pending, 1);
});

test("choosing the original value during a conflict still requires the new remote baseline", async () => {
  const f = fixture();
  const a = f.submit("priority", "P0");
  f.requests[0].resolve({ state: "conflict", larkBaseUpdated: false, conflicts: ["priority"], values: { priority: { value: "P3" } } }); await assert.rejects(a);
  const b = f.submit("priority", "P2", f.edits.project(ticket));
  f.edits.resolveConflict(ticket, "local"); f.clock.advance(1000);
  assert.equal(f.requests[1].input.changes[0].value, "P2");
  assert.deepEqual(f.requests[1].input.changes[0].expected, { value: "P3" });
  f.requests[1].resolve(); await b;
});

test("discard after a conflict retry restores the latest remote person's name, identity and avatar", async () => {
  const f = fixture();
  const a = f.submit("responsible", "Lin", ticket, "ou_lin");
  const people = [{ name: "Bob", userId: "ou_bob", avatarUrl: "https://example.com/bob.png" }];
  f.requests[0].resolve({ state: "conflict", larkBaseUpdated: false, conflicts: ["responsible"], values: { responsible: { value: "Bob", userIds: ["ou_bob"] } }, ticket: { responsible: "Bob", responsiblePeople: people } });
  await assert.rejects(a);
  f.edits.resolveConflict(ticket, "local"); f.clock.advance(1000);
  f.requests[1].resolve({ state: "rejected", larkBaseUpdated: false }); await turn();
  f.edits.discardDraft(ticket);
  assert.equal(f.edits.project(ticket).responsible, "Bob");
  assert.deepEqual(f.edits.project(ticket).responsiblePeople, people);
});

test("an explicit successful source recheck releases a prior missing-source guard and resumes retained drafts", async () => {
  const f = fixture(false);
  const a = f.submit("priority", "P0");
  f.edits.reportSourceError(ticket, Object.assign(new Error("source temporarily absent"), { code: "LARK_TICKET_SOURCE_NOT_FOUND" }));
  await assert.rejects(a);
  assert.equal(f.edits.status(ticket).blocked, true);
  await f.edits.recheck(ticket);
  assert.equal(f.edits.status(ticket).blocked, false);
  f.clock.advance(1000);
  assert.equal(f.requests.length, 1); f.requests[0].resolve(); await turn();
  assert.equal(f.edits.status(ticket).pending, 0);
});
