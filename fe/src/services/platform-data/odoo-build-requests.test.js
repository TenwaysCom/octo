import test from "node:test";
import assert from "node:assert/strict";
import { createOdooBuildRequests } from "./odoo-build-requests.js";

const input = { apiBaseUrl: "/api", owner: "TenwaysCom", repo: "tenways-ukk", pullNumber: 223, headRef: "feature/test" };
const ready = { state: "ready", environment: "uk", build: { status: "done", result: "success" } };
function harness(load) {
  let time = 100;
  let id = 0;
  const timers = new Map();
  const requests = createOdooBuildRequests({ load, now: () => time,
    schedule: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    cancel: (key) => timers.delete(key),
  });
  return { requests, timers, advance: (ms) => { time += ms; }, async tick() {
    const [key, timer] = timers.entries().next().value;
    timers.delete(key);
    time += timer.delay;
    timer.fn();
    await new Promise((resolve) => setImmediate(resolve));
    return timer.delay;
  } };
}

test("duplicate PR consumers share a request, results and polling; unmounting one keeps the other alive", async () => {
  let calls = 0;
  const h = harness(async () => ++calls === 1 ? { state: "refreshing" } : ready);
  const a = [], b = [];
  const stopA = h.requests.subscribe(input, (value) => a.push(value));
  h.requests.subscribe(input, (value) => b.push(value));
  assert.equal(h.timers.size, 1);
  await h.tick();
  stopA();
  await h.tick();
  assert.equal(calls, 2);
  assert.equal(a.at(-1).status, "refreshing");
  assert.equal(b.at(-1).status, "ready");
  assert.equal(h.timers.size, 0);
});

test("503 stops polling and remounts reuse failure until cooldown expires", async () => {
  let calls = 0;
  const h = harness(async () => { calls++; throw new Error("ODOO_DEVOPS_UNAVAILABLE"); });
  const values = [];
  const stop = h.requests.subscribe(input, (value) => values.push(value));
  await h.tick();
  stop();
  const stopAgain = h.requests.subscribe(input, (value) => values.push(value));
  assert.equal(values.at(-1).status, "unavailable");
  assert.equal(h.timers.size, 0);
  assert.equal(calls, 1);
  stopAgain();
  h.advance(30_001);
  h.requests.subscribe(input, () => {});
  await h.tick();
  assert.equal(calls, 2);
});

test("persistent 202 responses back off and stop after six attempts", async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return { state: "refreshing", retryAfterMs: 1000 }; });
  const values = [];
  h.requests.subscribe(input, (value) => values.push(value));
  const delays = [];
  while (h.timers.size) delays.push(await h.tick());
  assert.deepEqual(delays, [0, 1000, 2000, 4000, 8000, 8000]);
  assert.equal(calls, 6);
  assert.equal(values.at(-1).status, "unavailable");
});

test("last unmount stops polling, including a late 202 response", async () => {
  let resolve;
  const h = harness(() => new Promise((done) => { resolve = done; }));
  const values = [];
  const stop = h.requests.subscribe(input, (value) => values.push(value));
  await h.tick();
  stop();
  resolve({ state: "refreshing" });
  await new Promise((done) => setImmediate(done));
  assert.equal(h.timers.size, 0);
  assert.equal(values.length, 1);
});

test("a StrictMode setup/cleanup/setup still loads, and branch/origin changes stay isolated", async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return ready; });
  h.requests.subscribe(input, () => {})();
  h.requests.subscribe(input, () => {});
  h.requests.subscribe({ ...input, headRef: "other" }, () => {});
  h.requests.subscribe({ ...input, apiBaseUrl: "/other/api" }, () => {});
  while (h.timers.size) await h.tick();
  assert.equal(calls, 3);
});

test("stale builds and a successful empty result remain distinct from unavailable", async () => {
  const h = harness(async () => ({ ...ready, stale: true }));
  const values = [];
  h.requests.subscribe(input, (value) => values.push(value));
  await h.tick();
  assert.equal(values.at(-1).status, "stale");
  assert.equal(values.at(-1).builds[0].result, "success");
  const empty = harness(async () => ({ ...ready, build: null }));
  empty.requests.subscribe(input, (value) => values.push(value));
  await empty.tick();
  assert.deepEqual(values.at(-1), { status: "ready", builds: [] });
});

test("explicit cache reset ignores an older in-flight response and reloads active consumers", async () => {
  let resolve;
  let calls = 0;
  const h = harness(() => ++calls === 1 ? new Promise((done) => { resolve = done; }) : Promise.resolve(ready));
  const values = [];
  h.requests.subscribe(input, (value) => values.push(value));
  await h.tick();
  h.requests.invalidate(input.apiBaseUrl);
  await h.tick();
  resolve({ state: "refreshing" });
  await new Promise((done) => setImmediate(done));
  assert.equal(calls, 2);
  assert.equal(values.at(-1).status, "ready");
  assert.equal(h.timers.size, 0);
});
