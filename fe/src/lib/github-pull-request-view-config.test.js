import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GITHUB_PULL_REQUEST_SORT,
  DEFAULT_GITHUB_PULL_REQUEST_VISIBLE_COLUMNS,
  groupGitHubPullRequests,
  normalizeGitHubPullRequestGroupBy,
  normalizeGitHubPullRequestSort,
  normalizeGitHubPullRequestSubGroupBy,
  normalizeGitHubPullRequestViewMode,
  normalizeGitHubPullRequestVisibleColumns,
  sortGitHubPullRequests,
} from "./github-pull-request-view-config.js";

test("normalizes GitHub PR view configuration and keeps the Pull Request column visible", () => {
  const columnKeys = DEFAULT_GITHUB_PULL_REQUEST_VISIBLE_COLUMNS;
  assert.equal(columnKeys[columnKeys.indexOf("author") + 1], "meegleWorkitems");
  assert.equal(columnKeys.includes("meegleStatus"), false);
  assert.equal(columnKeys.includes("meegleSprint"), false);
  assert.equal(columnKeys.includes("meegleVersion"), false);
  assert.deepEqual(normalizeGitHubPullRequestVisibleColumns(undefined), DEFAULT_GITHUB_PULL_REQUEST_VISIBLE_COLUMNS);
  assert.deepEqual(normalizeGitHubPullRequestVisibleColumns(["status", "unknown", "status"]), ["pullRequest", "status"]);
  assert.equal(normalizeGitHubPullRequestGroupBy("repo"), "repo");
  assert.equal(normalizeGitHubPullRequestGroupBy("none"), "none");
  assert.equal(normalizeGitHubPullRequestGroupBy("unknown"), "status");
  assert.equal(normalizeGitHubPullRequestSubGroupBy("baseBranch", "status"), "baseBranch");
  assert.equal(normalizeGitHubPullRequestSubGroupBy("status", "status"), "none");
  assert.equal(normalizeGitHubPullRequestSubGroupBy("repo", "none"), "none");
  assert.equal(normalizeGitHubPullRequestViewMode("board"), "board");
  assert.equal(normalizeGitHubPullRequestViewMode("unknown"), "list");
  assert.deepEqual(normalizeGitHubPullRequestSort(undefined), DEFAULT_GITHUB_PULL_REQUEST_SORT);
  assert.deepEqual(normalizeGitHubPullRequestSort({ key: "repo", direction: "asc" }), { key: "repo", direction: "asc" });
});

test("sorts GitHub PRs by configured fields and leaves missing values last", () => {
  const items = [
    { pullNumber: 2, owner: "acme", repo: "web", sourceUpdatedAt: "2026-08-10T00:00:00Z" },
    { pullNumber: 1, owner: "acme", repo: "api", sourceUpdatedAt: "2026-08-12T00:00:00Z" },
    { pullNumber: 3, owner: "", repo: "" },
  ];
  assert.deepEqual(sortGitHubPullRequests(items, { key: "repo", direction: "asc" }).map((item) => item.pullNumber), [1, 2, 3]);
  assert.deepEqual(sortGitHubPullRequests(items, undefined).map((item) => item.pullNumber), [1, 2, 3]);
});

test("groups GitHub PRs with sub-groups and configured empty groups", () => {
  const allItems = [
    { pullNumber: 1, state: "open", baseRef: "main" },
    { pullNumber: 2, state: "closed", baseRef: "release" },
  ];
  const groups = groupGitHubPullRequests([allItems[0]], "status", {
    subGroupBy: "baseBranch",
    showEmptyGroups: true,
    groupValues: allItems,
    subGroupValues: allItems,
  });
  assert.deepEqual(groups.map((group) => ({
    label: group.label,
    ids: group.items.map((item) => item.pullNumber),
    subgroups: group.subgroups.map((subgroup) => ({ label: subgroup.label, ids: subgroup.items.map((item) => item.pullNumber) })),
  })), [
    { label: "open", ids: [1], subgroups: [{ label: "main", ids: [1] }, { label: "release", ids: [] }] },
    { label: "closed", ids: [], subgroups: [{ label: "main", ids: [] }, { label: "release", ids: [] }] },
  ]);
});
