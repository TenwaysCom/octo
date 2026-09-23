import test from "node:test";
import assert from "node:assert/strict";
import { getLarkAppUnderstanding, getLarkAppWikiHistory, LARK_APP_WIKI_ACTION, LARK_APP_ROADMAP, consumeLarkAppReturn, findLarkAppTicket, getLarkAppAnalysis, getLarkTicketAppHash, isLarkAppShortcut, parseLarkTicketAppHash, rememberLarkAppReturn } from "./lark-ticket-app.js";
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

test("common understanding uses successful Shadow and retains source timestamps", () => {
  const input = { ticketAi: { updatedAt: "formal-time", fields: { "AI意图": "正式分类", "AI Ticket 总结": "正式摘要" } }, shadowAi: { status: "ok", analyzedAt: "shadow-time", intentConfidence: 0.85, intent: "咨询", intentSummary: "希望取得权限", summary: "错误现象" } };
  const items = getLarkAppUnderstanding(input);
  assert.deepEqual(items.map(({ text, source, time }) => [text, source, time]), [["咨询", "Shadow AI", "shadow-time"], ["希望取得权限", "Shadow AI", "shadow-time"]]);
  assert.equal(items[1].label, "诉求摘要");
  assert.equal(items[0].confidence, 0.85);
  assert.equal(items[1].confidence, undefined);
  for (const status of ["error", "skipped"]) {
    const failed = getLarkAppUnderstanding({ ...input, shadowAi: { ...input.shadowAi, status } });
    assert.deepEqual(failed.map((item) => item.text), ["正式分类", "正式摘要"]);
    assert.ok(failed.every((item) => item.source === "Ticket AI" && item.time === "formal-time"));
    assert.equal(failed[1].label, "问题摘要（诉求待确认）");
    assert.ok(failed.every((item) => item.confidence === undefined));
  }
});

test("common understanding deduplicates identical summaries and leaves absent claims empty", () => {
  assert.equal(getLarkAppUnderstanding({ shadowAi: { status: "ok", intent: "同一句", intentSummary: " 同一句 " } }).length, 1);
  assert.ok(getLarkAppUnderstanding({}).every((item) => !item.text && !item.source && !item.time));
  const fallback = getLarkAppUnderstanding({ shadowAi: { status: "ok", summary: "已知现象" } });
  assert.equal(fallback[1].label, "问题摘要（诉求待确认）");
  assert.equal(fallback[1].text, "已知现象");
  assert.deepEqual(LARK_APP_ROADMAP.map(([title]) => title), ["危险等级（1–9）", "该不该马上回", "最佳动作"]);
});

test("Wiki history excludes other actions, sorts newest first, and does not change API input", () => {
  const records = [
    { sessionId: "old", actionKey: LARK_APP_WIKI_ACTION, updatedAt: "2026-09-22T01:00:00Z" },
    { sessionId: "chat", actionKey: "lark-ticket-support-qa-answer", updatedAt: "2026-09-23T03:00:00Z" },
    { sessionId: "new", actionKey: LARK_APP_WIKI_ACTION, updatedAt: "2026-09-23T01:00:00Z" },
  ];
  assert.deepEqual(getLarkAppWikiHistory(records).map((item) => item.sessionId), ["new", "old"]);
  assert.equal(records[0].sessionId, "old");
});
