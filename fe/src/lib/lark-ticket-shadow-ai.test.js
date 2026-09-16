import assert from "node:assert/strict";
import test from "node:test";
import {
  formatShadowConfidence,
  formatShadowDuration,
  getShadowResolutionLabel,
  getShadowStageDetails,
} from "./lark-ticket-shadow-ai.js";

test("formats Shadow labels and durations for FE display", () => {
  assert.equal(formatShadowConfidence(0.724), "72%");
  assert.equal(formatShadowDuration(3250), "3 秒");
  assert.equal(getShadowResolutionLabel("needs_info"), "需要补充信息");
});

test("builds stage-specific Shadow hover details", () => {
  const shadowAi = {
    status: "ok",
    intent: "troubleshoot / workflow_stuck",
    intentConfidence: 0.72,
    summary: "订单无法添加促销，待排查。",
    resolutionStatus: "pending",
    solutionSummary: "检查促销配置",
    solutionSteps: ["检查配置", "确认订单状态"],
    autoResolvable: false,
    resultConfidence: 0.8,
    qualitySummary: "缺少明确处理记录",
    warnings: ["缺少报错信息"],
  };

  assert.deepEqual(getShadowStageDetails(shadowAi, "intent").slice(0, 2), [
    { label: "意图", value: "troubleshoot / workflow_stuck" },
    { label: "置信度", value: "72%" },
  ]);
  assert.equal(getShadowStageDetails(shadowAi, "summary")[0].value, "订单无法添加促销，待排查。");
  const answerDetails = getShadowStageDetails(shadowAi, "answer");
  assert.deepEqual(answerDetails.slice(0, 3), [
    { label: "处理状态", value: "待处理" },
    { label: "方案摘要", value: "检查促销配置" },
    { label: "答案置信", value: "80%" },
  ]);
  assert.equal(answerDetails.find(({ label }) => label === "处理步骤").value, "1. 检查配置\n2. 确认订单状态");
  assert.deepEqual(getShadowStageDetails(shadowAi, "document"), []);
});

test("builds failure details without inventing analysis content", () => {
  const details = getShadowStageDetails({
    status: "error",
    errorCode: "SHADOW_OUTPUT_INVALID",
    errorMessage: "输出格式错误",
  }, "summary");

  assert.deepEqual(details, [
    { label: "状态", value: "失败" },
    { label: "错误码", value: "SHADOW_OUTPUT_INVALID" },
    { label: "错误信息", value: "输出格式错误" },
  ]);
});
