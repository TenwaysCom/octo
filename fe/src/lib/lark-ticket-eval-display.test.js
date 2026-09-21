import test from "node:test";
import assert from "node:assert/strict";
import { getEvalSamplesByTicket, getEvalStatusLabel } from "./lark-ticket-eval-display.js";

test("uses four compact labels without treating an unmarked ticket as draft", () => {
  assert.deepEqual([undefined, { datasetStatus: "draft" }, { datasetStatus: "badcase" }, { datasetStatus: "eval" }].map(getEvalStatusLabel), ["未标记", "Draft", "Bad case", "纳入 Eval"]);
});
test("selects newest matching snapshot irrespective of response ordering", () => {
  const ticket = { baseId: "b", tableId: "t", recordId: "r" };
  const samples = [
    { id: "new", ticket, snapshotVersion: 3, isMyEval: false },
    { id: "mine", ticket, snapshotVersion: 2, isMyEval: true },
    { id: "old", ticket, snapshotVersion: 1, isMyEval: true },
  ];
  assert.equal(getEvalSamplesByTicket(samples).get("b:t:r").id, "new");
  assert.equal(getEvalSamplesByTicket([...samples].reverse(), true).get("b:t:r").id, "mine");
});
