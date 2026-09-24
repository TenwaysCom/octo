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

test("shows risk and reply independently of confidence and distinguishes unknown from unevaluated", () => {
  const fields = (shadow) => Object.fromEntries(getShadowStageDetails({ status: "ok", ...shadow }, "answer").map(({ label, value }) => [label, value]));
  assert.equal(fields({})["业务风险"], "未评估");
  assert.equal(fields({})["回复时机（分析时）"], "未评估");
  const risk = { level: 7, rationale: "核心流程受阻", evidenceMessageIds: ["om_1"] };
  const reply = { advice: "no_reply_needed", rationale: "已告知当前进展，等待对方确认", evidenceMessageIds: ["om_2"] };
  for (const confidence of [0.1, 0.99]) {
    const result = fields({ businessRisk: risk, replyAdvice: reply, intentConfidence: confidence, resultConfidence: confidence });
    assert.equal(result["业务风险"], "7/9");
    assert.equal(result["回复时机（分析时）"], "暂无需回复");
    assert.equal(result["风险依据"], risk.rationale);
    assert.equal(result["回复依据"], reply.rationale);
  }
  assert.equal(fields({ businessRisk: { ...risk, level: null } })["业务风险"], "待确认");
});

test("shows incomplete/stale context and omitted messages without claiming live freshness", () => {
  const details = getShadowStageDetails({ status: "ok", contextInfo: { includedMessages: 2, totalMessages: 10, historyComplete: false, truncated: true, dirty: true, source: "stale_cache", omittedRanges: ["M2–M9"], syncedAt: null } }, "answer");
  const context = details.find(({ label }) => label === "消息上下文").value;
  assert.match(context, /2\/10 条/);
  assert.match(context, /快照历史不完整/);
  assert.match(context, /同步失败/);
  assert.equal(details.find(({ label }) => label === "快照同步时间").value, "未知");
});

test("distinguishes missing, empty, degraded and matched Wiki context with source limitations", () => {
  const fields = (wikiContext) => Object.fromEntries(getShadowStageDetails({ status: "ok", wikiContext }, "answer").map(({ label, value }) => [label, value]));
  assert.equal(fields(undefined)["Wiki 参考"], undefined);
  assert.equal(fields({ status: "no_matches", sources: [] })["Wiki 参考"], "未召回相关资料");
  assert.equal(fields({ status: "unavailable", sources: [] })["Wiki 参考"], "Wiki 不可用，本次仅基于聊天分析");
  const shown = fields({ status: "matched", sources: [{ sourceId: 1, title: "配置检查", path: "concepts/config.md", status: "draft", applicability: "historical_reference", limitations: ["前提待核实"] }] });
  assert.equal(shown["Wiki 参考"], "已参考 1 篇相关资料");
  assert.match(shown["Wiki 来源"], /\[W1\] 配置检查/);
  assert.match(shown["Wiki 来源"], /草稿；仅供历史参考/);
  assert.match(shown["Wiki 来源"], /前提待核实/);
});
