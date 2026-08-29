import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createDemoServer, DEMO_API_TOKEN, DEMO_PROJECT_KEY, DEMO_SPRINT_ID } from "../src/demo.js";
import { OctoApiClient } from "../src/http.js";

test("serves all five CLI demo data projections behind a bearer token", async () => {
  const server = createDemoServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const api = new OctoApiClient({ serverUrl: `http://127.0.0.1:${address.port}`, apiToken: DEMO_API_TOKEN });
    const burndown = await api.get(`/api/agent/v1/projects/${DEMO_PROJECT_KEY}/sprints/${DEMO_SPRINT_ID}/burndown`) as { points: unknown[] };
    const tasks = await api.get(`/api/agent/v1/projects/${DEMO_PROJECT_KEY}/sprints/${DEMO_SPRINT_ID}/tasks`) as { items: unknown[] };
    const pr = await api.get("/api/agent/v1/github/pull-requests/TenwaysCom/octo/42") as { meegleWorkitems: unknown[] };
    const ticket = await api.get("/api/agent/v1/lark-tickets/base-demo/table-tickets/rec-demo-1001") as { status: string };
    const odooBranches = await api.get("/api/agent/v1/odoo/branches", { environment: "eu" }) as { environment: string; items: unknown[] };
    assert.equal(burndown.points.length, 4);
    assert.equal(tasks.items.length, 2);
    assert.equal(pr.meegleWorkitems.length, 1);
    assert.equal(ticket.status, "In progress");
    assert.equal(odooBranches.environment, "eu");
    assert.equal(odooBranches.items.length, 2);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("rejects demo requests without the agent token", async () => {
  const server = createDemoServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const api = new OctoApiClient({ serverUrl: `http://127.0.0.1:${address.port}`, apiToken: "wrong-token" });
    await assert.rejects(() => api.get(`/api/agent/v1/projects/${DEMO_PROJECT_KEY}/sprints/${DEMO_SPRINT_ID}/burndown`), /UNAUTHORIZED/);
  } finally {
    server.close();
    await once(server, "close");
  }
});
