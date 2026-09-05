import assert from "node:assert/strict";
import test from "node:test";
import { isOneShotLarkTicketAiAction, LARK_TICKET_AI_QUICK_ACTIONS } from "./lark-ticket-ai-actions.js";

test("only Problem Summary is a one-shot DeepSeek action", () => {
  assert.deepEqual(
    LARK_TICKET_AI_QUICK_ACTIONS.filter((action) => action.oneShot).map((action) => action.actionKey),
    ["lark-ticket-support-qa-summarize"],
  );
  assert.equal(isOneShotLarkTicketAiAction("lark-ticket-support-qa-summarize"), true);
  assert.equal(isOneShotLarkTicketAiAction("lark-ticket-support-qa-answer"), false);
  assert.equal(isOneShotLarkTicketAiAction("lark-ticket-support-qa-document-preview"), false);
});
