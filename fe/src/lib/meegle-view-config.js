export const MEEGLE_VIEW_COLUMNS = [
  { key: "workitem", label: "工作项", sortKey: "workitem", required: true },
  { key: "workitemType", label: "类型", sortKey: "workitemType" },
  { key: "status", label: "状态", sortKey: "status" },
  { key: "pullRequests", label: "关联 PR" },
  { key: "sprint", label: "Sprint", sortKey: "sprint" },
  { key: "version", label: "Version", sortKey: "version" },
  { key: "system", label: "System", sortKey: "system" },
  { key: "assignee", label: "负责人", sortKey: "assignee" },
  { key: "updatedAt", label: "更新时间", sortKey: "updatedAt" },
];

export const MEEGLE_GROUP_OPTIONS = [
  ["none", "不分组"],
  ["status", "状态"],
  ["workitemType", "类型"],
  ["sprint", "Sprint"],
  ["version", "Version"],
  ["system", "System"],
  ["assignee", "负责人"],
];

export const DEFAULT_MEEGLE_VISIBLE_COLUMNS = MEEGLE_VIEW_COLUMNS.map(({ key }) => key);

const COLUMN_KEYS = new Set(DEFAULT_MEEGLE_VISIBLE_COLUMNS);
const GROUP_KEYS = new Set(MEEGLE_GROUP_OPTIONS.map(([key]) => key));
const SORT_KEYS = new Set(MEEGLE_VIEW_COLUMNS.flatMap(({ sortKey }) => sortKey ? [sortKey] : []));

export function normalizeMeegleVisibleColumns(value) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_MEEGLE_VISIBLE_COLUMNS];
  }
  const visible = [...new Set(value.filter((key) => COLUMN_KEYS.has(key)))];
  return visible.includes("workitem") ? visible : ["workitem", ...visible];
}

export function normalizeMeegleGroupBy(value) {
  return GROUP_KEYS.has(value) ? value : "status";
}

export function normalizeMeegleSort(value) {
  if (!SORT_KEYS.has(value?.key)) {
    return { key: "updatedAt", direction: "desc" };
  }
  return { key: value.key, direction: value.direction === "asc" ? "asc" : "desc" };
}

export function getMeegleWorkitemViewValue(item, key) {
  const values = {
    workitem: item.workItemKey || item.workItemId || item.title || "",
    workitemType: item.workItemType || item.workItemTypeKey || "",
    status: item.status || "",
    sprint: item.sprint || "",
    version: item.version || "",
    system: item.system || "",
    assignee: item.assignee || "",
    updatedAt: item.sourceUpdatedAt || item.syncedAt || "",
  };
  return values[key] || "";
}

export function sortMeegleWorkitems(items, sort) {
  const normalizedSort = normalizeMeegleSort(sort);
  return [...items].sort((left, right) => {
    const leftValue = getMeegleWorkitemViewValue(left, normalizedSort.key);
    const rightValue = getMeegleWorkitemViewValue(right, normalizedSort.key);
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

export function groupMeegleWorkitems(items, groupBy) {
  if (groupBy === "none") {
    return [];
  }
  const grouped = new Map();
  for (const item of items) {
    const value = getMeegleWorkitemViewValue(item, groupBy);
    const key = value || "__unset__";
    const group = grouped.get(key) || { key, label: value || "未设置", items: [] };
    group.items.push(item);
    grouped.set(key, group);
  }
  return [...grouped.values()];
}
