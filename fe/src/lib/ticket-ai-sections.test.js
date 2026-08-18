import assert from "node:assert/strict";
import test from "node:test";
import { getTicketAiSections, hasTicketAiValue } from "./ticket-ai-sections.js";

test("treats only meaningful Ticket AI values as populated", () => {
  assert.equal(hasTicketAiValue(undefined), false);
  assert.equal(hasTicketAiValue("  "), false);
  assert.equal(hasTicketAiValue([]), false);
  assert.equal(hasTicketAiValue("skip"), true);
  assert.equal(hasTicketAiValue(0), true);
  assert.equal(hasTicketAiValue({ text: "已分析" }), true);
});

test("groups Ticket AI fields in stable business order and omits empty details", () => {
  const sections = getTicketAiSections({
    "AI LLM Eval Score": 86,
    "AI Ticket 总结": "权限恢复后正常",
    "AI分析状态": "需人工确认",
    "AI建议产物": "skip",
  });

  assert.deepEqual(sections.map((section) => ({
    id: section.id,
    hasData: section.hasData,
    itemNames: section.items.map((item) => item.name),
    summaryNames: section.summary.map((item) => item.name),
  })), [
    {
      id: "analysis",
      hasData: true,
      itemNames: ["AI Ticket 总结", "AI分析状态"],
      summaryNames: ["AI Ticket 总结", "AI分析状态"],
    },
    {
      id: "knowledge",
      hasData: true,
      itemNames: ["AI建议产物"],
      summaryNames: ["AI建议产物"],
    },
    {
      id: "evidence",
      hasData: true,
      itemNames: ["AI LLM Eval Score"],
      summaryNames: ["AI LLM Eval Score"],
    },
  ]);
});
