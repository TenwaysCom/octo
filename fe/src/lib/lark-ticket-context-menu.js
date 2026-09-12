import { getLarkTicketBadgeTone } from "./lark-ticket-badges.js";

// Pure helpers for the Linear-style Lark Ticket context menu: menu model,
// option counts from the currently loaded list, and viewport-aware positions.

export const LARK_TICKET_MENU_FIELD_ACTIONS = [
  { field: "status", label: "更新状态" },
  { field: "responsible", label: "修改负责人" },
  { field: "requester", label: "修改需求人" },
  { field: "priority", label: "修改紧急度" },
  { field: "issueType", label: "修改类型" },
  { field: "businessLine", label: "修改 Business Line" },
];

const FIELD_VALUE_KEYS = {
  status: (ticket) => [ticket.ticketStatus],
  responsible: (ticket) => splitPeople(ticket.responsible),
  requester: (ticket) => splitPeople(ticket.requester),
  priority: (ticket) => [ticket.priority],
  issueType: (ticket) => [ticket.issueType],
  businessLine: (ticket) => [ticket.businessLine],
};

function splitPeople(value) {
  return String(value || "").split(/[,，]/).map((name) => name.trim()).filter(Boolean);
}

export function getLarkTicketFieldValue(ticket, field) {
  return (FIELD_VALUE_KEYS[field]?.(ticket) || [])[0] || "";
}

export function isCurrentLarkTicketOption(ticket, field, optionLabel) {
  const normalized = String(optionLabel || "").trim().toLocaleLowerCase();
  if (!normalized) return false;
  return (FIELD_VALUE_KEYS[field]?.(ticket) || [])
    .some((value) => String(value ?? "").trim().toLocaleLowerCase() === normalized);
}

// Counts each option value across the currently loaded list so the submenu can
// show Linear-style counters; options absent from the list get 0.
export function countLarkTicketFieldValues(items, field) {
  const counts = new Map();
  for (const item of items || []) {
    for (const value of FIELD_VALUE_KEYS[field]?.(item) || []) {
      const key = String(value ?? "").trim().toLocaleLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

export function getLarkTicketOptionTone(field, label) {
  if (field === "status") return getLarkTicketBadgeTone("status", label);
  if (field === "priority") return getLarkTicketBadgeTone("priority", label);
  if (field === "issueType") return getLarkTicketBadgeTone("type", label);
  if (field === "businessLine") return getLarkTicketBadgeTone("business-line", label);
  return "default";
}

// Builds the rendered menu model: field actions with submenus, then the
// create-Meegle action without one. Options carry label/userId/tone/count/current.
export function buildLarkTicketMenuSections({ ticket, fieldOptions = [], items = [] }) {
  const optionsByField = new Map(fieldOptions.map((entry) => [entry.field, entry]));
  const fieldItems = LARK_TICKET_MENU_FIELD_ACTIONS.map(({ field, label }) => {
    const entry = optionsByField.get(field);
    const counts = countLarkTicketFieldValues(items, field);
    const options = (entry?.options || []).map((option) => ({
      ...option,
      tone: getLarkTicketOptionTone(field, option.label),
      count: counts.get(String(option.label).trim().toLocaleLowerCase()) || 0,
      isCurrent: isCurrentLarkTicketOption(ticket, field, option.label),
    }));
    return {
      key: field,
      kind: "field",
      field,
      label,
      submenuTitle: `${label}…`,
      optionsKind: entry?.kind || "select",
      options,
    };
  });
  return [
    { items: fieldItems },
    { items: [{ key: "create-meegle", kind: "create-meegle", label: "创建 Meegle Work Item" }] },
    { items: [
      { key: "open-base", kind: "open-base", label: "打开 Lark Base" },
      { key: "open-message", kind: "open-message", label: "打开 Lark 消息", disabled: !getLarkTicketResourceUrl(ticket.larkMessageLink) },
    ] },
  ];
}

export const LARK_TICKET_CONTEXT_MENU_WIDTH = 232;
export const LARK_TICKET_CONTEXT_MENU_MARGIN = 12;

export function getLarkTicketMenuPosition(
  point,
  viewport = { width: window.innerWidth, height: window.innerHeight },
  estimatedHeight = 320,
) {
  const overflowRight = point.x + LARK_TICKET_CONTEXT_MENU_WIDTH > viewport.width - LARK_TICKET_CONTEXT_MENU_MARGIN;
  const left = overflowRight ? point.x - LARK_TICKET_CONTEXT_MENU_WIDTH : point.x;
  const top = point.y + estimatedHeight > viewport.height - LARK_TICKET_CONTEXT_MENU_MARGIN
    ? viewport.height - estimatedHeight - LARK_TICKET_CONTEXT_MENU_MARGIN
    : point.y;
  return {
    left: Math.round(Math.max(LARK_TICKET_CONTEXT_MENU_MARGIN, left)),
    top: Math.round(Math.max(LARK_TICKET_CONTEXT_MENU_MARGIN, top)),
    flipSubmenu: point.x + LARK_TICKET_CONTEXT_MENU_WIDTH * 2 > viewport.width - LARK_TICKET_CONTEXT_MENU_MARGIN,
  };
}


export function getLarkTicketResourceUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
