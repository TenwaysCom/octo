import assert from "node:assert/strict";
import test from "node:test";
import { createLarkTicketEvalSample, listLarkTicketEvalSamples, updateLarkTicketEvalSample } from "./lark-ticket-eval-api.js";

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

test("lists Eval samples", async () => {
  assert.deepEqual(await listLarkTicketEvalSamples({ apiBaseUrl: "/api", fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, data: { samples: [] } }) }) }), []);
});
