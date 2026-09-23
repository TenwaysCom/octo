import { getShadowIntentLabel } from "./lark-ticket-shadow-ai.js";

export function getLarkTicketAppHash(ticket) {
  if (!ticket) return "#lark-app-thread-analysis";
  return `#lark-app-thread-analysis?${new URLSearchParams({ baseId: ticket.baseId, tableId: ticket.tableId, recordId: ticket.recordId })}`;
}

export function parseLarkTicketAppHash(hash) {
  if (hash !== "#lark-app-thread-analysis" && !hash.startsWith("#lark-app-thread-analysis?")) return null;
  const query = new URLSearchParams(hash.split("?")[1]);
  const ref = Object.fromEntries(["baseId", "tableId", "recordId"].map((key) => [key, query.get(key) || ""]));
  const hasContext = Object.values(ref).some(Boolean);
  return { ref: hasContext ? ref : null, invalid: hasContext && Object.values(ref).some((value) => !value || value.length > 128) };
}

export function isLarkAppShortcut(search) {
  const query = new URLSearchParams(search);
  const scenes = ["message_action", "chat_action", "plus_menu_p2p", "plus_menu_group"];
  return scenes.includes(query.get("from")) || scenes.includes(query.get("required_launch_ability"));
}

export function findLarkAppTicket(items, ref) {
  return ref ? items.find((item) => ["baseId", "tableId", "recordId"].every((key) => item[key] === ref[key])) : undefined;
}

function displayText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join("、");
  return "";
}

export function getLarkAppAnalysis(ticket) {
  const fields = ticket.ticketAi?.fields || {};
  const shadow = ticket.shadowAi?.status === "ok" ? ticket.shadowAi : undefined;
  return [
    ["intent", "意图", displayText(fields["AI意图"]) || fields["AI Bug 分类"], getShadowIntentLabel(shadow)],
    ["summary", "问题总结", fields["AI Ticket 总结"], shadow?.summary],
    ["answer", "答案与处理方案", fields["AI回答总结"], shadow?.solutionSummary],
  ].map(([id, title, formal, fallback]) => {
    const formalText = displayText(formal);
    const shadowText = displayText(fallback);
    return { id, title, text: formalText || shadowText, source: formalText ? "Ticket AI" : shadowText ? "Shadow AI" : "", formalText, shadowText };
  });
}

// Keep only a local navigation target across the existing OAuth round trip.
const RETURN_KEY = "octo.lark-app.return";
export function rememberLarkAppReturn(hash, storage) {
  if (!parseLarkTicketAppHash(hash)) return;
  try { storage.setItem(RETURN_KEY, hash); } catch { /* Storage may be disabled in a webview. */ }
}

export function consumeLarkAppReturn(hash, storage) {
  try {
    const saved = storage.getItem(RETURN_KEY);
    storage.removeItem(RETURN_KEY);
    if ((!hash || hash === "#integrations") && saved && parseLarkTicketAppHash(saved)) return saved;
  } catch { /* Use the current URL when storage is unavailable. */ }
  return hash;
}

export const LARK_APP_WIKI_ACTION = "lark-ticket-wiki-qa";
export const LARK_APP_ROADMAP = [
  ["危险等级（1–9）", "需定义业务风险分级及依据；不使用答案置信度换算风险。"],
  ["该不该马上回", "结合时限、消息状态和影响判断回复时机。"],
  ["最佳动作", "根据证据给出回复、澄清、排查或升级等下一步建议。"],
];

export function getLarkAppUnderstanding(ticket) {
  const shadow = ticket.shadowAi?.status === "ok" ? ticket.shadowAi : null;
  const cards = getLarkAppAnalysis(ticket);
  const intent = shadow ? displayText(getShadowIntentLabel(shadow)) : cards[0].formalText;
  const intentSummary = displayText(shadow?.intentSummary);
  const summary = intentSummary || displayText(shadow?.summary) || cards[1].formalText;
  const summarySource = intentSummary || displayText(shadow?.summary) ? "Shadow AI" : summary ? "Ticket AI" : "";
  const timeFor = (source) => source === "Shadow AI" ? shadow?.analyzedAt : source === "Ticket AI" ? ticket.ticketAi?.updatedAt : undefined;
  const intentSource = intent ? shadow ? "Shadow AI" : "Ticket AI" : "";
  return [
    { id: "intent", label: "意图推断", text: intent, source: intentSource, time: timeFor(intentSource), confidence: intentSource === "Shadow AI" ? shadow.intentConfidence : undefined },
    ...(summary && summary === intent ? [] : [{ id: "summary", label: intentSummary ? "诉求摘要" : summary ? "问题摘要（诉求待确认）" : "诉求摘要", text: summary, source: summarySource, time: timeFor(summarySource) }]),
  ];
}

export function getLarkAppWikiHistory(sessions) {
  return sessions.filter((session) => session.actionKey === LARK_APP_WIKI_ACTION)
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
}
