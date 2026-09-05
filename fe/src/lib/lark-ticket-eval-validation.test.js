import assert from "node:assert/strict";
import test from "node:test";
import { getLarkTicketEvalSaveErrorMessage, getLarkTicketEvalValidationMessage } from "./lark-ticket-eval-validation.js";

const completeEvalDraft = {
  datasetStatus: "eval",
  manualIntent: "登录异常",
  expectedOutcome: "说明恢复登录的处理步骤",
  failureLabels: [],
};

test("explains the fields required before an Eval sample can be saved", () => {
  assert.equal(getLarkTicketEvalValidationMessage({ ...completeEvalDraft, manualIntent: "", expectedOutcome: "" }), "纳入 Eval 前，请填写「人工标准意图」、填写「期望结果」。");
  assert.equal(getLarkTicketEvalValidationMessage({ ...completeEvalDraft, datasetStatus: "badcase", failureLabels: [] }), "标记 Badcase 前，请至少选择一个失败标签。");
  assert.equal(getLarkTicketEvalValidationMessage({ ...completeEvalDraft, datasetStatus: "badcase", failureLabels: ["fact_incorrect"] }), "");
  assert.equal(getLarkTicketEvalValidationMessage({ ...completeEvalDraft, datasetStatus: "draft", manualIntent: "", expectedOutcome: "" }), "");
});

test("does not expose a raw invalid-request code when the server rejects an Eval save", () => {
  assert.equal(
    getLarkTicketEvalSaveErrorMessage({ code: "INVALID_REQUEST", message: "INVALID_REQUEST" }),
    "保存内容未通过校验：请填写「人工标准意图」和「期望结果」；标记 Badcase 时还需至少选择一个失败标签。",
  );
});
