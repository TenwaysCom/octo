import test from "node:test";
import assert from "node:assert/strict";
import { createEvalSaveAttempt, getFrozenEvalTicket, initialEvalDraft, mergeEvalDraft } from "./lark-ticket-eval-save.js";
import { getCurrentEvalSample, getEvalSamplesByTicket } from "./lark-ticket-eval-display.js";
import { getLarkTicketEvalValidationMessage } from "./lark-ticket-eval-validation.js";

test("retries one payload with the same actionRunId, but changes it after an edit or reload", () => {
  let counter = 0;
  const prepare = createEvalSaveAttempt(() => String(++counter));
  const draft = { datasetStatus: "badcase", notes: "环境错误", failureLabels: ["fact_incorrect"], expectedUpdatedAt: "v1" };
  assert.equal(prepare(draft).actionRunId, "1");
  assert.equal(prepare({ ...draft }).actionRunId, "1");
  assert.equal(prepare({ ...draft, expectedUpdatedAt: "v2" }).actionRunId, "2");
  assert.equal(prepare({ ...draft, notes: "修改原因" }).actionRunId, "3");
});

test("reload preserves edits while adopting newer fields the operator has not touched", () => {
  const before = { datasetStatus: "badcase", notes: "原原因", manualIntent: "原意图", failureLabels: ["fact_incorrect"] };
  const after = { ...before, notes: "他人的原因", manualIntent: "新意图", expectedOutcome: "新期望", failureLabels: ["answer_unusable"] };
  const draft = { ...initialEvalDraft(before), notes: "我的修改", datasetStatus: "eval" };
  assert.deepEqual(mergeEvalDraft(draft, before, after), { ...initialEvalDraft(after), notes: "我的修改", datasetStatus: "eval" });
});

test("new results stay unmarked and frozen samples never use current Shadow as a fallback", () => {
  const ticket = { baseId: "b", tableId: "t", recordId: "r", shadowAi: { status: "ok", evalVersion: "v2" } };
  const legacy = { id: "legacy", ticket, snapshotVersion: 1, aiOutput: { "AI意图": "正式意图" } };
  const old = { id: "old", source: "shadow", outputVersion: "v1", ticket, snapshotVersion: 1, createdAt: "01", updatedAt: "99", aiOutput: { shadowAi: { analyzedAt: "01", summary: "旧结果" } } };
  const latest = { ...old, id: "new", outputVersion: "v2", createdAt: "02", updatedAt: "02", aiOutput: { shadowAi: { analyzedAt: "02", summary: "新结果" } } };
  assert.equal(getCurrentEvalSample([legacy, old], ticket), undefined);
  assert.equal(getCurrentEvalSample([legacy, old, latest], ticket), latest);
  assert.equal(getEvalSamplesByTicket([old, latest]).get("b:t:r"), latest);
  assert.deepEqual(getFrozenEvalTicket(old), { shadowAi: old.aiOutput.shadowAi });
  assert.deepEqual(getFrozenEvalTicket(legacy), { ticketAi: { fields: legacy.aiOutput } });
});

test("Shadow Badcase requires a reason without changing legacy sample validation", () => {
  const draft = { datasetStatus: "badcase", failureLabels: ["fact_incorrect"], notes: "  " };
  assert.match(getLarkTicketEvalValidationMessage(draft, "shadow"), /填写失败原因/);
  assert.equal(getLarkTicketEvalValidationMessage(draft, "legacy"), "");
  assert.equal(getLarkTicketEvalValidationMessage({ ...draft, notes: "环境错误" }, "shadow"), "");
  assert.equal(getLarkTicketEvalValidationMessage({ ...draft, datasetStatus: "eval" }, "shadow"), "");
  assert.match(getLarkTicketEvalValidationMessage({ ...draft, notes: "x".repeat(4001) }, "shadow"), /4000/);
});
