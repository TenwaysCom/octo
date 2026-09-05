import { parsePlatformTimestamp } from "./formatters.js";

export const MEEGLE_VIEW_COLUMNS = [
  { key: "workitem", label: "工作项", sortKey: "workitem", required: true },
  { key: "workitemType", label: "类型", sortKey: "workitemType" },
  { key: "status", label: "状态", sortKey: "status" },
  { key: "pullRequests", label: "关联 PR" },
  { key: "sprint", label: "Sprint", sortKey: "sprint" },
  { key: "version", label: "Version", sortKey: "version" },
  { key: "system", label: "System", sortKey: "system" },
  { key: "assignee", label: "负责人", sortKey: "assignee" },
  { key: "relatedPeople", label: "相关人" },
  { key: "currentWorkingTime", label: "当前工作时长" },
  { key: "createdAt", label: "创建时间", sortKey: "createdAt" },
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
export const DEFAULT_MEEGLE_VIEW_MODE = "list";
export const DEFAULT_MEEGLE_GROUP_BY = "workitemType";

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
  return GROUP_KEYS.has(value) ? value : DEFAULT_MEEGLE_GROUP_BY;
}

export function getDefaultMeegleCollapsedGroupKeys(groups) {
  return [...new Set((groups || []).map((group) => group.key).filter((key) => typeof key === "string"))];
}

export function normalizeMeegleSubGroupBy(value, groupBy) {
  if (groupBy === "none" || value === groupBy || !GROUP_KEYS.has(value)) {
    return "none";
  }
  return value;
}

export function normalizeMeegleViewMode(value) {
  return value === "board" ? "board" : DEFAULT_MEEGLE_VIEW_MODE;
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
    createdAt: item.createdAt || "",
    updatedAt: item.sourceUpdatedAt || item.syncedAt || "",
  };
  return values[key] || "";
}

export function sortMeegleWorkitems(items, sort) {
  const normalizedSort = normalizeMeegleSort(sort);
  return [...items].sort((left, right) => {
    const leftValue = getMeegleWorkitemViewValue(left, normalizedSort.key);
    const rightValue = getMeegleWorkitemViewValue(right, normalizedSort.key);
    const isDateSort = normalizedSort.key === "updatedAt" || normalizedSort.key === "createdAt";
    const leftComparable = isDateSort ? parsePlatformTimestamp(leftValue) : leftValue;
    const rightComparable = isDateSort ? parsePlatformTimestamp(rightValue) : rightValue;
    const leftMissing = isDateSort ? Number.isNaN(leftComparable) : !leftComparable;
    const rightMissing = isDateSort ? Number.isNaN(rightComparable) : !rightComparable;
    if (leftMissing && !rightMissing) return 1;
    if (!leftMissing && rightMissing) return -1;
    if (leftMissing && rightMissing) return 0;
    const comparison = isDateSort
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
    .map((item) => getMeegleWorkitemViewValue(item, groupBy))
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
    const value = getMeegleWorkitemViewValue(item, groupBy);
    const descriptor = getGroupDescriptor(value);
    const group = grouped.get(descriptor.key) || { ...descriptor, items: [] };
    group.items.push(item);
    grouped.set(descriptor.key, group);
  }
  return [...grouped.values()];
}

export function groupMeegleWorkitems(items, groupBy, options = {}) {
  const normalizedGroupBy = normalizeMeegleGroupBy(groupBy);
  const subGroupBy = normalizeMeegleSubGroupBy(options.subGroupBy, normalizedGroupBy);
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
