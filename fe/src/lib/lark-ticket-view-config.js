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
export const DEFAULT_LARK_TICKET_VIEW_MODE = "list";

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

export function normalizeLarkTicketSubGroupBy(value, groupBy) {
  if (groupBy === "none" || value === groupBy || !GROUP_KEYS.has(value)) {
    return "none";
  }
  return value;
}

export function normalizeLarkTicketViewMode(value) {
  return value === "board" ? "board" : DEFAULT_LARK_TICKET_VIEW_MODE;
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

function getGroupDescriptor(value) {
  return value ? { key: value, label: value } : { key: "__unset__", label: "未设置" };
}

function getConfiguredGroupValues(groupValues, groupBy) {
  return [...new Set((groupValues || [])
    .map((item) => getLarkTicketViewValue(item, groupBy))
    .map((value) => getGroupDescriptor(value).key))];
}

function createGroups(items, groupBy, groupValues, includeEmptyGroups) {
  const grouped = new Map();
  if (includeEmptyGroups) {
    for (const key of getConfiguredGroupValues(groupValues, groupBy)) {
      const descriptor = key === "__unset__" ? getGroupDescriptor("") : getGroupDescriptor(key);
      grouped.set(descriptor.key, { ...descriptor, items: [] });
    }
  }
  for (const item of items) {
    const value = getLarkTicketViewValue(item, groupBy);
    const descriptor = getGroupDescriptor(value);
    const group = grouped.get(descriptor.key) || { ...descriptor, items: [] };
    group.items.push(item);
    grouped.set(descriptor.key, group);
  }
  return [...grouped.values()];
}

export function groupLarkTickets(items, groupBy, options = {}) {
  const normalizedGroupBy = normalizeLarkTicketGroupBy(groupBy);
  const subGroupBy = normalizeLarkTicketSubGroupBy(options.subGroupBy, normalizedGroupBy);
  const primaryGroups = normalizedGroupBy === "none"
    ? [{ key: "__all__", label: "全部", items: items }]
    : createGroups(items, normalizedGroupBy, options.groupValues, options.showEmptyGroups);

  if (subGroupBy === "none") {
    return primaryGroups;
  }

  return primaryGroups.map((group) => ({
    ...group,
    subgroups: createGroups(group.items, subGroupBy, options.subGroupValues, options.showEmptyGroups)
      .map((subgroup) => ({ ...subgroup, subgroupKey: subgroup.key, key: `${group.key}::${subgroup.key}` })),
  }));
}
