import assert from "node:assert/strict";
import test from "node:test";
import { createLarkTicketEvalSample, listLarkTicketEvalSamples, updateLarkTicketEvalSample, createShadowEvalSample, loadShadowEvalSample } from "./lark-ticket-eval-api.js";

const ticket = { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" };
test("creates and updates a browser-session Eval sample", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ ok: true, data: { sample: { id: "sample_1" } } }) }; };
  await createLarkTicketEvalSample({ apiBaseUrl: "/api", ticket, actionRunId: "run_1", fetchImpl });
  await updateLarkTicketEvalSample({ apiBaseUrl: "/api", sampleId: "sample_1", update: { datasetStatus: "eval", manualIntent: "登录", expectedOutcome: "恢复", notes: null, failureLabels: [], actionRunId: "run_2" }, fetchImpl });
  assert.equal(requests[0].url, "/api/web/lark-tickets/rec_1/eval-sample");
  assert.deepEqual(JSON.parse(requests[0].options.body), { baseId: "app_1", tableId: "tbl_1", actionRunId: "run_1" });
  assert.equal(requests[1].url, "/api/web/lark-ticket-eval-samples/sample_1");
  assert.equal(requests[1].options.credentials, "include");
});

test("scopes reads to the full Ticket identity and submits a complete initial Shadow annotation", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ ok: true, data: { samples: [], sample: { id: "shadow" } } }) }; };
  await listLarkTicketEvalSamples({ apiBaseUrl: "/api", ticket, fetchImpl });
  await loadShadowEvalSample({ apiBaseUrl: "/api", ticket, actionRunId: "read", fetchImpl });
  const update = { outputVersion: "v1", actionRunId: "save", datasetStatus: "badcase", notes: "环境错误", failureLabels: ["fact_incorrect"] };
  await createShadowEvalSample({ apiBaseUrl: "/api", ticket, update, fetchImpl });
  assert.equal(requests[0].url, "/api/web/lark-ticket-eval-samples?baseId=app_1&tableId=tbl_1&recordId=rec_1");
  assert.equal(requests[1].url, "/api/web/lark-tickets/rec_1/shadow-eval-sample?baseId=app_1&tableId=tbl_1&actionRunId=read");
  assert.deepEqual(JSON.parse(requests[2].options.body), { baseId: ticket.baseId, tableId: ticket.tableId, ...update });
  assert.equal(requests[2].options.credentials, "include");
});

test("lists Eval samples", async () => {
  assert.deepEqual(await listLarkTicketEvalSamples({ apiBaseUrl: "/api", fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, data: { samples: [] } }) }) }), []);
});

test("requests My evals using the Web session without sending a reviewer identity", async () => {
  await listLarkTicketEvalSamples({ apiBaseUrl: "/api", mine: true, fetchImpl: async (url, options) => {
    assert.equal(url, "/api/web/lark-ticket-eval-samples?mine=true");
    assert.equal(options.credentials, "include");
    return { ok: true, json: async () => ({ ok: true, data: { samples: [] } }) };
  } });
});
