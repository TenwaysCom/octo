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
  const updatedAt = new Date(item.sourceUpdatedAt || item.syncedAt || "");
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
