import assert from "node:assert/strict";
import test from "node:test";
import { createLarkTicketFieldEdits } from "./lark-ticket-field-edits.js";

const ticket = { baseId: "base", tableId: "table", recordId: "record", ticketStatus: "Open", priority: "P2", responsible: "Ada", solution: "old" };
function fixture() {
  const requests = [];
  const creates = [];
  const patches = [];
  const edits = createLarkTicketFieldEdits({ apiBaseUrl: "/api", onPatch: (patch) => patches.push(patch),
    createMeegle: (input) => new Promise((resolve, reject) => creates.push({ input, resolve, reject })),
    update: (input) => new Promise((resolve, reject) => requests.push({ input, resolve, reject })) });
  const submit = (field, value, target = ticket, optionUserId) => {
    const done = edits.submit({ ticket: target, field, value, optionUserId, actionRunId: `run_${field}_${value}` });
    // UI consumes errors via status; keep rejections observable without unhandled rejection noise.
    done.catch(() => {});
    return done;
  };
  return { edits, requests, patches, submit, creates };
}

test("immediately projects continuous edits, serializes requests and ignores unrelated fields in old responses", async () => {
  const { edits, requests, submit } = fixture();
  const first = submit("status", "In Progress");
  const second = submit("priority", "P0");
  const third = submit("responsible", "Lin", ticket, "ou_lin");
  assert.equal(requests.length, 1);
  assert.equal(edits.project(ticket).priority, "P0");
  assert.equal(edits.project(ticket).responsible, "Lin");
  assert.equal(edits.status(ticket).pending, 3);
  requests[0].resolve({ ticket: { ticketStatus: "In Progress", priority: "P2", responsible: "Ada", solution: "stale" } });
  await first;
  assert.equal(requests.length, 2);
  assert.equal(edits.project(ticket).priority, "P0");
  assert.equal(edits.project(ticket).solution, "old");
  requests[1].resolve({ ticket: { priority: "P0", responsible: "Ada" } });
  await second;
  assert.equal(requests[2].input.optionUserId, "ou_lin");
  requests[2].resolve({ ticket: { responsible: "Lin" } });
  await third;
  assert.equal(edits.status(ticket).pending, 0);
  assert.deepEqual(edits.project(ticket), { ...ticket, ticketStatus: "In Progress", priority: "P0", responsible: "Lin" });
});

test("multiple failed edits roll back to the last confirmed value, not another failed optimistic value", async () => {
  const { edits, requests, submit } = fixture();
  const first = submit("status", "B");
  const second = submit("status", "C");
  requests[0].reject(new Error("first rejected"));
  await assert.rejects(first);
  assert.equal(edits.project(ticket).ticketStatus, "C");
  requests[1].reject(new Error("second rejected"));
  await assert.rejects(second);
  assert.equal(edits.project(ticket).ticketStatus, "Open");
  assert.match(edits.status(ticket).notices[0], /second rejected/);
});

test("an older success remains hidden by a newer pending edit, and becomes the rollback baseline", async () => {
  const { edits, requests, submit } = fixture();
  const first = submit("status", "B");
  const second = submit("status", "C");
  requests[0].resolve({ ticket: { ticketStatus: "B" } });
  await first;
  assert.equal(edits.project(ticket).ticketStatus, "C");
  requests[1].reject(new Error("rejected"));
  await assert.rejects(second);
  assert.equal(edits.project(ticket).ticketStatus, "B");
});

test("one failed field does not roll back another successful field or a newer value", async () => {
  const { edits, requests, submit } = fixture();
  const first = submit("priority", "P0");
  const second = submit("responsible", "Lin");
  requests[0].reject(new Error("rejected"));
  await assert.rejects(first);
  assert.equal(edits.project(ticket).priority, "P2");
  assert.equal(edits.project(ticket).responsible, "Lin");
  requests[1].resolve({ ticket: { responsible: "Lin", priority: "P0" } });
  await second;
  assert.equal(edits.project(ticket).priority, "P2");
});

test("partial sync success keeps the remote-saved value and warns instead of rolling back or resending", async () => {
  const { edits, requests, submit } = fixture();
  const done = submit("solution", "");
  requests[0].resolve({ larkBaseUpdated: true, syncFailed: true });
  await done;
  assert.equal(edits.project(ticket).solution, "");
  assert.match(edits.status(ticket).notices[0], /已写入 Lark Base/);
  edits.accept([ticket], edits.getVersion());
  assert.equal(edits.project(ticket).solution, "");
  assert.equal(requests.length, 1);
});

test("fresh-read barriers protect against late list loads and allow subsequent external changes", async () => {
  const { edits, requests, submit } = fixture();
  const readBeforeEdit = edits.getVersion();
  const done = submit("priority", "P0");
  const readDuringSave = edits.getVersion();
  requests[0].resolve({ ticket: { priority: "P0" } });
  await done;
  for (const version of [readBeforeEdit, readDuringSave]) {
    edits.accept([ticket], version);
    assert.equal(edits.project(ticket).priority, "P0");
  }
  const external = { ...ticket, priority: "P1" };
  edits.accept([external], edits.getVersion());
  assert.equal(edits.project(external).priority, "P1");
});

test("navigation patches survive detaching listeners, roll back the right Ticket and isolate identical record IDs", async () => {
  const { edits, requests, patches, submit } = fixture();
  const unsubscribe = edits.subscribe(() => {});
  const first = submit("priority", "P0");
  const other = { ...ticket, tableId: "other" };
  const second = submit("priority", "P1", other);
  assert.equal(requests.length, 2);
  unsubscribe();
  assert.equal(edits.project(ticket).priority, "P0");
  assert.equal(edits.project(other).priority, "P1");
  requests[0].reject(new Error("rejected"));
  await assert.rejects(first);
  assert.deepEqual(patches.at(-1), { baseId: "base", tableId: "table", recordId: "record", priority: "P2" });
  requests[1].resolve({ ticket: { priority: "P1" } });
  await second;
  assert.equal(edits.project(ticket).priority, "P2");
});

test("Finish applies the server-confirmed close time without changing unrelated fields", async () => {
  const { edits, requests, submit } = fixture();
  const done = submit("status", "Finish");
  requests[0].resolve({ ticket: { ticketStatus: "Finish", closedAt: "2026-10-21T00:00:00.000Z", solution: "stale" } });
  await done;
  assert.equal(edits.project(ticket).closedAt, "2026-10-21T00:00:00.000Z");
  assert.equal(edits.project(ticket).solution, "old");
});

test("logout discards unsent changes and never dispatches them with another session", async () => {
  const { edits, requests, submit } = fixture();
  const first = submit("priority", "P0");
  const second = submit("status", "Finish");
  edits.dispose();
  await assert.rejects(second, /登录状态/);
  requests[0].resolve({ ticket: { priority: "P0" } });
  await first;
  assert.equal(requests.length, 1);
  await assert.rejects(submit("priority", "P1"), /登录状态/);
});

test("StrictMode's effect replay keeps the shared queue usable", async () => {
  const { edits, requests, submit } = fixture();
  const release = edits.retain();
  release();
  const releaseAgain = edits.retain();
  await Promise.resolve();
  const done = submit("priority", "P0");
  requests[0].resolve({ ticket: { priority: "P0" } });
  await done;
  releaseAgain();
  await Promise.resolve();
  await assert.rejects(submit("priority", "P1"), /登录状态/);
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
