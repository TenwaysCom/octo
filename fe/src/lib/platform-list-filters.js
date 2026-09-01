import { parsePlatformTimestamp } from "./formatters.js";

export const DATE_FILTERS = [
  ["today", "今天"],
  ["last-7-days", "最近 7 天"],
  ["last-month", "最近一个月"],
  ["last-12-months", "最近一年"],
];

export function normalizeFilterValues(values, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  return [...new Set(source.filter((value) => typeof value === "string" && value))];
}

export function getEarliestSelectedDate(selectedDateFilters, now = new Date()) {
  if (!selectedDateFilters.length) return undefined;
  const dates = selectedDateFilters.flatMap((dateFilter) => {
    const threshold = new Date(now);
    if (dateFilter === "today") threshold.setHours(0, 0, 0, 0);
    else if (dateFilter === "last-7-days") threshold.setDate(now.getDate() - 7);
    else if (dateFilter === "last-month") threshold.setMonth(now.getMonth() - 1);
    else if (dateFilter === "last-12-months") threshold.setFullYear(now.getFullYear() - 1);
    else return [];
    return [threshold];
  });
  if (!dates.length) return undefined;
  return new Date(Math.min(...dates.map((value) => value.getTime()))).toISOString();
}

export function getPlatformListFilters({
  page,
  selectedStatuses,
  selectedDateFilters,
  selectedSprints,
  selectedTagFilters,
  larkTicketQuickFilter,
  meegleQuickFilter,
  workitemTypeFilter,
  noSprintFilter,
}) {
  const sourceUpdatedAtAfter = getEarliestSelectedDate(selectedDateFilters);
  if (page === "lark-tickets") {
    return {
      ...(selectedStatuses ? { status: selectedStatuses } : {}),
      ...(sourceUpdatedAtAfter ? { sourceUpdatedAtAfter } : {}),
      ...(selectedTagFilters.issueType?.length ? { issueType: selectedTagFilters.issueType } : {}),
      ...(selectedTagFilters.priority?.length ? { priority: selectedTagFilters.priority } : {}),
      ...(selectedTagFilters.responsible?.length ? { responsible: selectedTagFilters.responsible } : {}),
      ...(larkTicketQuickFilter !== "all" ? { quickFilter: larkTicketQuickFilter } : {}),
    };
  }
  if (page === "meegle-workitems") {
    const sprints = noSprintFilter ? [] : [...new Set([
      ...selectedSprints,
      ...(selectedTagFilters.sprint || []),
    ])];
    return {
      ...(selectedStatuses ? { status: selectedStatuses } : {}),
      ...(sourceUpdatedAtAfter ? { sourceUpdatedAtAfter } : {}),
      ...(sprints.length ? { sprint: sprints } : {}),
      ...(selectedTagFilters.project?.length ? { project: selectedTagFilters.project } : {}),
      ...(selectedTagFilters.priority?.length ? { priority: selectedTagFilters.priority } : {}),
      ...(selectedTagFilters.relatedPerson?.length ? { relatedPerson: selectedTagFilters.relatedPerson } : {}),
      ...(meegleQuickFilter === "subscribed" ? { subscribed: true } : {}),
      ...(workitemTypeFilter !== "all" ? { workitemType: workitemTypeFilter } : {}),
      ...(noSprintFilter ? { withoutSprint: true } : {}),
    };
  }
  return {
    ...(selectedStatuses ? { status: selectedStatuses } : {}),
    ...(sourceUpdatedAtAfter ? { sourceUpdatedAtAfter } : {}),
    ...(selectedTagFilters.repo?.length ? { repo: selectedTagFilters.repo } : {}),
    ...(selectedTagFilters.label?.length ? { label: selectedTagFilters.label } : {}),
    ...(selectedTagFilters.reviewer?.length ? { reviewer: selectedTagFilters.reviewer } : {}),
  };
}

export function toggleFilterValue(values, value) {
  return values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value];
}

export function matchesSelectedDateFilters(item, selectedDateFilters, now = new Date()) {
  if (!selectedDateFilters.length) {
    return true;
  }
  return selectedDateFilters.some((dateFilter) => matchesDateFilter(item, dateFilter, now));
}

export function matchesSelectedSprints(item, selectedSprints) {
  return !selectedSprints.length || selectedSprints.includes(item.sprint || "");
}

export function countFilterValues(items, getValues) {
  const counts = new Map();
  for (const item of items) {
    for (const value of getValues(item)) {
      const normalized = String(value || "").trim();
      if (normalized) {
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN", { numeric: true }));
}

export function matchesSelectedTagFilters(item, fields, selectedValues) {
  return fields.every((field) => {
    const selected = selectedValues[field.key] || [];
    return selected.length === 0 || field.getValues(item).some((value) => selected.includes(String(value || "").trim()));
  });
}

function matchesDateFilter(item, dateFilter, now) {
  const updatedAt = new Date(parsePlatformTimestamp(item.sourceUpdatedAt || item.syncedAt));
  if (Number.isNaN(updatedAt.getTime())) {
    return false;
  }

  const threshold = new Date(now);
  if (dateFilter === "today") {
    threshold.setHours(0, 0, 0, 0);
  } else if (dateFilter === "last-7-days") {
    threshold.setDate(now.getDate() - 7);
  } else if (dateFilter === "last-month") {
    threshold.setMonth(now.getMonth() - 1);
  } else if (dateFilter === "last-12-months") {
    threshold.setFullYear(now.getFullYear() - 1);
  } else {
    return false;
  }
  return updatedAt >= threshold;
}
