export const GITHUB_PULL_REQUEST_VIEW_COLUMNS = [
  { key: "pullRequest", label: "Pull Request", sortKey: "pullRequest", required: true },
  { key: "repo", label: "仓库", sortKey: "repo" },
  { key: "status", label: "状态", sortKey: "status" },
  { key: "branch", label: "分支", sortKey: "branch" },
  { key: "author", label: "Author", sortKey: "author" },
  { key: "meegleWorkitems", label: "关联 Meegle" },
  { key: "mergedBy", label: "Merged by", sortKey: "mergedBy" },
  { key: "reviewers", label: "Reviewer" },
  { key: "labels", label: "Label" },
  { key: "updatedAt", label: "更新时间", sortKey: "updatedAt" },
];

export const GITHUB_PULL_REQUEST_GROUP_OPTIONS = [
  ["none", "不分组"],
  ["status", "状态"],
  ["repo", "仓库"],
  ["baseBranch", "目标分支"],
  ["author", "Author"],
  ["mergedBy", "Merged by"],
];

export const DEFAULT_GITHUB_PULL_REQUEST_SORT = { key: "updatedAt", direction: "desc" };
export const DEFAULT_GITHUB_PULL_REQUEST_VISIBLE_COLUMNS = GITHUB_PULL_REQUEST_VIEW_COLUMNS.map(({ key }) => key);
export const DEFAULT_GITHUB_PULL_REQUEST_VIEW_MODE = "list";

const COLUMN_KEYS = new Set(DEFAULT_GITHUB_PULL_REQUEST_VISIBLE_COLUMNS);
const GROUP_KEYS = new Set(GITHUB_PULL_REQUEST_GROUP_OPTIONS.map(([key]) => key));
const SORT_KEYS = new Set(GITHUB_PULL_REQUEST_VIEW_COLUMNS.flatMap(({ sortKey }) => sortKey ? [sortKey] : []));

export function normalizeGitHubPullRequestVisibleColumns(value) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_GITHUB_PULL_REQUEST_VISIBLE_COLUMNS];
  }
  const visible = [...new Set(value.filter((key) => COLUMN_KEYS.has(key)))];
  return visible.includes("pullRequest") ? visible : ["pullRequest", ...visible];
}

export function normalizeGitHubPullRequestGroupBy(value) {
  return GROUP_KEYS.has(value) ? value : "status";
}

export function normalizeGitHubPullRequestSubGroupBy(value, groupBy) {
  if (groupBy === "none" || value === groupBy || !GROUP_KEYS.has(value)) {
    return "none";
  }
  return value;
}

export function normalizeGitHubPullRequestViewMode(value) {
  return value === "board" ? "board" : DEFAULT_GITHUB_PULL_REQUEST_VIEW_MODE;
}

export function normalizeGitHubPullRequestSort(value) {
  if (!SORT_KEYS.has(value?.key)) {
    return { ...DEFAULT_GITHUB_PULL_REQUEST_SORT };
  }
  return { key: value.key, direction: value.direction === "asc" ? "asc" : "desc" };
}

export function getGitHubPullRequestViewValue(item, key) {
  const values = {
    pullRequest: item.pullNumber || item.title || "",
    repo: [item.owner, item.repo].filter(Boolean).join(" / "),
    status: item.isDraft ? "Draft" : item.state || "",
    branch: item.headRef || "",
    baseBranch: item.baseRef || "",
    author: item.authorLogin || "",
    mergedBy: item.mergedBy || "",
    updatedAt: item.sourceUpdatedAt || item.syncedAt || "",
  };
  return values[key] || "";
}

export function sortGitHubPullRequests(items, sort) {
  const normalizedSort = normalizeGitHubPullRequestSort(sort);
  return [...items].sort((left, right) => {
    const leftValue = getGitHubPullRequestViewValue(left, normalizedSort.key);
    const rightValue = getGitHubPullRequestViewValue(right, normalizedSort.key);
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
    .map((item) => getGitHubPullRequestViewValue(item, groupBy))
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
    const value = getGitHubPullRequestViewValue(item, groupBy);
    const descriptor = getGroupDescriptor(value);
    const group = grouped.get(descriptor.key) || { ...descriptor, items: [] };
    group.items.push(item);
    grouped.set(descriptor.key, group);
  }
  return [...grouped.values()];
}

export function groupGitHubPullRequests(items, groupBy, options = {}) {
  const normalizedGroupBy = normalizeGitHubPullRequestGroupBy(groupBy);
  const subGroupBy = normalizeGitHubPullRequestSubGroupBy(options.subGroupBy, normalizedGroupBy);
  const primaryGroups = normalizedGroupBy === "none"
    ? [{ key: "__all__", label: "全部", items }]
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
