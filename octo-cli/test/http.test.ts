import assert from "node:assert/strict";
import test from "node:test";
import { OctoApiClient } from "../src/http.js";

test("sends an agent token and unwraps successful data", async () => {
  let requestUrl: string | undefined;
  let authorization: string | undefined;
  const client = new OctoApiClient(
    { serverUrl: "https://octo.example/", apiToken: "agent-token" },
    { fetchImpl: async (input, init) => {
      requestUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? undefined;
      return new Response(JSON.stringify({ ok: true, data: { sprintId: "sprint-1" } }), { status: 200 });
    } },
  );
  const result = await client.get("/api/agent/v1/sprints/sprint-1/tasks");
  assert.deepEqual(result, { sprintId: "sprint-1" });
  assert.equal(authorization, "Bearer agent-token");
  assert.equal(requestUrl, "https://octo.example/api/agent/v1/sprints/sprint-1/tasks");
});

test("returns the Octo error code for failed requests", async () => {
  const client = new OctoApiClient(
    { serverUrl: "https://octo.example", apiToken: "agent-token" },
    { fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: { errorCode: "SNAPSHOT_NOT_FOUND" } }), { status: 404 }) },
  );
  await assert.rejects(() => client.get("/api/agent/v1/sprints/missing/tasks"), /SNAPSHOT_NOT_FOUND/);
});
