export const LARK_TICKET_VIEW_COLUMNS = [
  { key: "title", label: "Ticket", sortKey: "title", required: true },
  { key: "status", label: "状态", sortKey: "status" },
  { key: "issueType", label: "Issue 类型", sortKey: "issueType" },
  { key: "requester", label: "需求人", sortKey: "requester" },
  { key: "responsible", label: "负责人", sortKey: "responsible" },
  { key: "priority", label: "紧急度", sortKey: "priority" },
  { key: "updatedAt", label: "更新时间", sortKey: "updatedAt" },
];

export const LARK_TICKET_GROUP_OPTIONS = [
  ["none", "不分组"],
  ["status", "状态"],
  ["issueType", "Issue 类型"],
  ["requester", "需求人"],
  ["responsible", "负责人"],
  ["priority", "紧急度"],
];

export const DEFAULT_LARK_TICKET_SORT = { key: "status", direction: "asc" };
export const DEFAULT_LARK_TICKET_VISIBLE_COLUMNS = LARK_TICKET_VIEW_COLUMNS.map(({ key }) => key);

const COLUMN_KEYS = new Set(DEFAULT_LARK_TICKET_VISIBLE_COLUMNS);
const GROUP_KEYS = new Set(LARK_TICKET_GROUP_OPTIONS.map(([key]) => key));
const SORT_KEYS = new Set(LARK_TICKET_VIEW_COLUMNS.map(({ sortKey }) => sortKey));

export function normalizeLarkTicketVisibleColumns(value) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_LARK_TICKET_VISIBLE_COLUMNS];
  }
  const visible = [...new Set(value.filter((key) => COLUMN_KEYS.has(key)))];
  return visible.includes("title") ? visible : ["title", ...visible];
}

export function normalizeLarkTicketGroupBy(value) {
  return GROUP_KEYS.has(value) ? value : "status";
}

export function normalizeLarkTicketSort(value) {
  if (!SORT_KEYS.has(value?.key)) {
    return { ...DEFAULT_LARK_TICKET_SORT };
  }
  return { key: value.key, direction: value.direction === "desc" ? "desc" : "asc" };
}

export function getLarkTicketViewValue(item, key) {
  const values = {
    title: item.title || item.ticketNumber || item.recordId || "",
    status: item.ticketStatus || "",
    issueType: item.issueType || "",
    requester: item.requester || "",
    responsible: item.responsible || "",
    priority: item.priority || "",
    updatedAt: item.sourceUpdatedAt || item.syncedAt || "",
  };
  return values[key] || "";
}

export function sortLarkTickets(items, sort) {
  const normalizedSort = normalizeLarkTicketSort(sort);
  return [...items].sort((left, right) => {
    const leftValue = getLarkTicketViewValue(left, normalizedSort.key);
    const rightValue = getLarkTicketViewValue(right, normalizedSort.key);
    const leftComparable = normalizedSort.key === "updatedAt" ? Date.parse(leftValue) : leftValue;
    const rightComparable = normalizedSort.key === "updatedAt" ? Date.parse(rightValue) : rightValue;
    const leftMissing = normalizedSort.key === "updatedAt" ? Number.isNaN(leftComparable) : !leftComparable;
    const rightMissing = normalizedSort.key === "updatedAt" ? Number.isNaN(rightComparable) : !rightComparable;
    if (leftMissing && !rightMissing) return 1;
    if (!leftMissing && rightMissing) return -1;
    if (leftMissing && rightMissing) return 0;
    const comparison = normalizedSort.key === "updatedAt"
      ? leftComparable - rightComparable
      : String(leftComparable).localeCompare(String(rightComparable), "zh-CN", { numeric: true, sensitivity: "base" });
    return normalizedSort.direction === "asc" ? comparison : -comparison;
  });
}

export function groupLarkTickets(items, groupBy) {
  if (groupBy === "none") {
    return [];
  }
  const grouped = new Map();
  for (const item of items) {
    const value = getLarkTicketViewValue(item, groupBy);
    const key = value || "__unset__";
    const group = grouped.get(key) || { key, label: value || "未设置", items: [] };
    group.items.push(item);
    grouped.set(key, group);
  }
  return [...grouped.values()];
}
