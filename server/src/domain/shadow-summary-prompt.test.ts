import { DEFAULT_SHADOW_SUMMARY_PROMPT, SHADOW_SUMMARY_PROMPT_KEY } from "./shadow-summary-prompt.js";
import { DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATE } from "./workflow-prompts.js";

it("preserves the established intent rubric and keeps Shadow-only rules out of formal Summary", () => {
  const intentRules = DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATE.split("# 意图定义与判定边界")[1].split("# 输出要求")[0];
  expect(DEFAULT_SHADOW_SUMMARY_PROMPT).toContain(intentRules.trim());
  expect(DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATE).not.toContain('"businessRisk"');
  expect(SHADOW_SUMMARY_PROMPT_KEY).not.toBe("lark_ticket.support_qa.summarize");
  expect(DEFAULT_SHADOW_SUMMARY_PROMPT).toContain("禁止用它换算、抬高或降低业务风险");
  expect(DEFAULT_SHADOW_SUMMARY_PROMPT).toContain("高风险已有效回应时不要求重复回复");
  expect(DEFAULT_SHADOW_SUMMARY_PROMPT).toContain("低风险也可能因反馈承诺逾期而需要立即回复");
  expect(DEFAULT_SHADOW_SUMMARY_PROMPT).toContain("若缺失内容影响判断，输出 undetermined");
  expect(DEFAULT_SHADOW_SUMMARY_PROMPT).toContain("不能仅凭 Ticket 关闭状态、“收到”或“谢谢”断言风险解除");
});
