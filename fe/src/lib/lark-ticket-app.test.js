import test from "node:test";
import assert from "node:assert/strict";
import { consumeLarkAppReturn, findLarkAppTicket, getLarkAppAnalysis, getLarkTicketAppHash, isLarkAppShortcut, parseLarkTicketAppHash, rememberLarkAppReturn } from "./lark-ticket-app.js";
import { canAccessWorkspaceRoute, getWorkspaceRoute } from "../app/routes/workspace-routes.js";

const ticket = { baseId: "base1", tableId: "table1", recordId: "rec/中文" };

test("Ticket app deep links preserve the complete identity and require platform access", () => {
  const hash = getLarkTicketAppHash(ticket);
  assert.deepEqual(parseLarkTicketAppHash(hash), { ref: ticket, invalid: false });
  const route = getWorkspaceRoute(hash);
  assert.equal(route.page, "lark-app");
  assert.equal(canAccessWorkspaceRoute({ platformLists: false }, route), false);
  assert.equal(canAccessWorkspaceRoute({ platformLists: true }, route), true);
  assert.equal(parseLarkTicketAppHash("#lark-app-thread-analysis?recordId=rec1").invalid, true);
  assert.equal(parseLarkTicketAppHash("#lark-app-thread-analysis-other"), null);
  assert.equal(findLarkAppTicket([{ ...ticket, baseId: "other" }, ticket], ticket), ticket);
});

test("analysis preserves per-field provenance and never uses failed Shadow data", () => {
  const input = { ticketAi: { fields: { "AI意图": "   ", "AI Ticket 总结": "正式总结" } }, shadowAi: { status: "ok", intent: "咨询", summary: "影子总结", solutionSummary: "已有处理结果" } };
  const cards = getLarkAppAnalysis(input);
  assert.equal(cards[0].source, "Shadow AI");
  assert.equal(cards[1].text, "正式总结");
  assert.equal(cards[1].shadowText, "影子总结");
  assert.equal(cards[2].text, "已有处理结果");
  for (const status of ["error", "skipped"]) {
    assert.equal(getLarkAppAnalysis({ shadowAi: { ...input.shadowAi, status } })[2].text, "");
  }
  assert.ok(getLarkAppAnalysis({}).every((item) => !item.text && !item.source));
});

test("detects official desktop and mobile shortcut entry without treating triggerCode as a Ticket ID", () => {
  assert.equal(isLarkAppShortcut("?from=message_action&bdp_launch_query=x"), true);
  assert.equal(isLarkAppShortcut("?required_launch_ability=message_action"), true);
  assert.equal(isLarkAppShortcut("?from=chat_action"), true);
  assert.equal(isLarkAppShortcut("?required_launch_ability=plus_menu_group"), true);
  assert.equal(isLarkAppShortcut("?required_launch_ability=plus_menu_p2p"), true);
  assert.equal(isLarkAppShortcut("?from=workplace"), false);
  assert.equal(parseLarkTicketAppHash("#lark-app-thread-analysis?bdp_launch_query=x").ref, null);
});

test("OAuth return restores only a local app route once, without overriding explicit navigation", () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const hash = getLarkTicketAppHash(ticket);
  rememberLarkAppReturn(hash, storage);
  assert.equal(consumeLarkAppReturn("", storage), hash);
  assert.equal(consumeLarkAppReturn("", storage), "");
  rememberLarkAppReturn(hash, storage);
  assert.equal(consumeLarkAppReturn("#lark-tickets", storage), "#lark-tickets");
  rememberLarkAppReturn("https://evil.example", storage);
  assert.equal(consumeLarkAppReturn("", storage), "");
});
