import { parsePlatformTimestamp } from "./formatters.js";

export const SPRINT_WORKITEM_VIEW_COLUMNS = [
  { key: "workitem", label: "工作项", sortKey: "workitem", required: true },
  { key: "workitemType", label: "类型", sortKey: "workitemType" },
  { key: "status", label: "状态", sortKey: "status" },
  { key: "project", label: "项目", sortKey: "project" },
  { key: "version", label: "Version", sortKey: "version" },
  { key: "system", label: "System", sortKey: "system" },
  { key: "pullRequests", label: "Related PR" },
  { key: "priority", label: "优先级", sortKey: "priority" },
  { key: "assignee", label: "负责人", sortKey: "assignee" },
  { key: "relatedPeople", label: "当前相关人" },
  { key: "currentWorkingTime", label: "当前工作时长" },
  { key: "updatedAt", label: "更新时间", sortKey: "updatedAt" },
];

export const SPRINT_WORKITEM_GROUP_OPTIONS = [
  ["none", "不分组"],
  ["workitemType", "类型"],
  ["status", "状态"],
  ["project", "项目"],
  ["version", "Version"],
  ["system", "System"],
  ["priority", "优先级"],
  ["assignee", "负责人"],
];

export const DEFAULT_SPRINT_WORKITEM_VISIBLE_COLUMNS = SPRINT_WORKITEM_VIEW_COLUMNS.map(({ key }) => key);

const COLUMN_KEYS = new Set(DEFAULT_SPRINT_WORKITEM_VISIBLE_COLUMNS);
const GROUP_KEYS = new Set(SPRINT_WORKITEM_GROUP_OPTIONS.map(([key]) => key));
const SORT_KEYS = new Set(SPRINT_WORKITEM_VIEW_COLUMNS.flatMap(({ sortKey }) => sortKey ? [sortKey] : []));
const FILTER_KEYS = new Set(["workitemType", "status", "project", "system", "priority", "assignee"]);

export function normalizeSprintWorkitemVisibleColumns(value) {
  if (!Array.isArray(value)) return [...DEFAULT_SPRINT_WORKITEM_VISIBLE_COLUMNS];
  const visible = [...new Set(value.filter((key) => COLUMN_KEYS.has(key)))];
  return visible.includes("workitem") ? visible : ["workitem", ...visible];
}

export function normalizeSprintWorkitemSort(value) {
  if (!SORT_KEYS.has(value?.key)) return { key: "updatedAt", direction: "desc" };
  return { key: value.key, direction: value.direction === "asc" ? "asc" : "desc" };
}

export function normalizeSprintWorkitemGroupBy(value) {
  return GROUP_KEYS.has(value) ? value : "none";
}

export function normalizeSprintWorkitemSubGroupBy(value, groupBy) {
  if (groupBy === "none" || value === groupBy || !GROUP_KEYS.has(value)) return "none";
  return value;
}

export function normalizeSprintWorkitemPageState(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const groupBy = normalizeSprintWorkitemGroupBy(source.groupBy);
  const selectedWorkitemFilters = Object.fromEntries(Object.entries(source.selectedWorkitemFilters || {})
    .filter(([key, values]) => FILTER_KEYS.has(key) && Array.isArray(values))
    .map(([key, values]) => [key, [...new Set(values.filter((item) => typeof item === "string" && item))]])
    .filter(([, values]) => values.length));
  return {
    selectedWorkitemFilters,
    groupBy,
    subGroupBy: normalizeSprintWorkitemSubGroupBy(source.subGroupBy, groupBy),
    sort: normalizeSprintWorkitemSort(source.sort),
    visibleColumns: normalizeSprintWorkitemVisibleColumns(source.visibleColumns),
  };
}

export function rememberSprintWorkitemPageState(currentStates, sprintRef, pageState) {
  if (typeof sprintRef !== "string" || !sprintRef) return currentStates;
  const current = currentStates && typeof currentStates === "object" && !Array.isArray(currentStates) ? currentStates : {};
  return { ...current, [sprintRef]: normalizeSprintWorkitemPageState(pageState) };
}

export function getSprintWorkitemViewValue(item, key) {
  const values = {
    workitem: item.workItemKey || item.workItemId || item.title || "",
    workitemType: item.workItemType || item.workItemTypeKey || "",
    status: item.status || "",
    project: item.projectName || item.projectKey || "",
    version: item.version || "",
    system: item.system || "",
    priority: item.priority || "",
    assignee: item.assignee || "",
    updatedAt: item.sourceUpdatedAt || item.syncedAt || "",
  };
  return values[key] || "";
}

export function sortSprintWorkitems(items, sort) {
  const normalizedSort = normalizeSprintWorkitemSort(sort);
  return [...items].sort((left, right) => {
    const leftValue = getSprintWorkitemViewValue(left, normalizedSort.key);
    const rightValue = getSprintWorkitemViewValue(right, normalizedSort.key);
    const leftComparable = normalizedSort.key === "updatedAt" ? parsePlatformTimestamp(leftValue) : leftValue;
    const rightComparable = normalizedSort.key === "updatedAt" ? parsePlatformTimestamp(rightValue) : rightValue;
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

export function splitSprintWorkitemsByCarryover(items) {
  const currentSprintItems = [];
  const carryoverItems = [];
  for (const item of items || []) {
    if (item?.carryoverToSprintId || item?.carryoverToSprintName) carryoverItems.push(item);
    else currentSprintItems.push(item);
  }
  return [
    { key: "carryover", label: "已结转至后续 Sprint", items: carryoverItems },
    { key: "current", label: "本 Sprint 工作项", items: currentSprintItems },
  ].filter((section) => section.items.length);
}

function getGroupDescriptor(value) {
  return value ? { key: value, label: value } : { key: "__unset__", label: "未设置" };
}

function createGroups(items, groupBy) {
  const grouped = new Map();
  for (const item of items) {
    const descriptor = getGroupDescriptor(getSprintWorkitemViewValue(item, groupBy));
    const group = grouped.get(descriptor.key) || { ...descriptor, items: [] };
    group.items.push(item);
    grouped.set(descriptor.key, group);
  }
  return [...grouped.values()];
}

export function groupSprintWorkitems(items, groupBy, options = {}) {
  const normalizedGroupBy = normalizeSprintWorkitemGroupBy(groupBy);
  const subGroupBy = normalizeSprintWorkitemSubGroupBy(options.subGroupBy, normalizedGroupBy);
  const primaryGroups = normalizedGroupBy === "none"
    ? [{ key: "__all__", label: "全部", items }]
    : createGroups(items, normalizedGroupBy);

  if (subGroupBy === "none") return primaryGroups;

  return primaryGroups.map((group) => ({
    ...group,
    subgroups: createGroups(group.items, subGroupBy)
      .map((subgroup) => ({ ...subgroup, subgroupKey: subgroup.key, key: `${group.key}::${subgroup.key}` })),
  }));
}
