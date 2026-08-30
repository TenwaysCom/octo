import assert from "node:assert/strict";
import test from "node:test";
import {
  ROW_OVERFLOW_LIMIT,
  buildGitHubPullRequestRow,
  buildLarkTicketRow,
  buildMeegleWorkitemRow,
  getMeegleWorkitemCategory,
  splitOverflowItems,
} from "./platform-list-rows.js";

test("splitOverflowItems keeps the first N items inline and the rest in overflow", () => {
  const { visible, overflow } = splitOverflowItems(["a", "b", "c", "d", "e"], 2);
  assert.deepEqual(visible, ["a", "b"]);
  assert.deepEqual(overflow, ["c", "d", "e"]);
});

test("splitOverflowItems never drops items and tolerates invalid input", () => {
  const { visible, overflow } = splitOverflowItems(["a", "b"], ROW_OVERFLOW_LIMIT);
  assert.deepEqual([...visible, ...overflow], ["a", "b"]);
  assert.deepEqual(splitOverflowItems(null), { visible: [], overflow: [] });
  assert.deepEqual(splitOverflowItems(["a"], 0).visible, ["a"]);
});

test("buildLarkTicketRow puts type, priority and status on the left and people/date on the right", () => {
  const item = {
    recordId: "rec123",
    ticketNumber: "T-10086",
    title: "登录失败",
    ticketStatus: "处理中",
    issueType: "Production Bug",
    priority: "P1",
    requester: "张三",
    responsible: "李四",
    sourceUpdatedAt: "2026-08-01T10:00:00.000Z",
  };
  const row = buildLarkTicketRow(item, ["title", "status", "issueType", "requester", "responsible", "priority", "updatedAt"]);
  assert.equal(row.kind, "lark-tickets");
  assert.equal(row.identifier, "T-10086");
  assert.equal(row.title, "登录失败");
  assert.equal(row.href, "#lark-tickets/rec123");
  assert.equal(row.external, false);
  assert.deepEqual(row.leading.map((meta) => meta.key), ["issueType", "priority", "status"]);
  assert.deepEqual(row.trailing.map((meta) => meta.key), ["requester", "responsible", "updatedAt"]);
  assert.deepEqual(row.leading.map((meta) => meta.type), ["lark-badge", "lark-badge", "lark-badge"]);
});

test("buildLarkTicketRow respects visible columns", () => {
  const row = buildLarkTicketRow({ recordId: "rec1", title: "t" }, ["title", "status"]);
  assert.deepEqual(row.leading.map((meta) => meta.key), ["status"]);
  assert.deepEqual(row.trailing, []);
});

test("buildMeegleWorkitemRow links externally and carries collapsible PR data", () => {
  const item = {
    projectKey: "octo",
    workItemTypeKey: "story",
    workItemId: "666",
    workItemKey: "OCTO-666",
    title: "列表页改造",
    status: "Doing",
    subStage: "开发",
    sprint: "Sprint 12",
    assignee: "王五",
    githubPullRequests: [
      { owner: "tenways", repo: "octo", pullNumber: 1, htmlUrl: "https://github.com/tenways/octo/pull/1", state: "open" },
    ],
    sourceUpdatedAt: "2026-08-02T10:00:00.000Z",
  };
  const row = buildMeegleWorkitemRow(item, ["workitem", "workitemType", "status", "pullRequests", "sprint", "assignee", "updatedAt"]);
  assert.equal(row.kind, "meegle-workitems");
  assert.equal(row.identifier, "OCTO-666");
  assert.equal(row.external, true);
  assert.match(row.href, /^https:\/\/project\.larksuite\.com\/octo\/story\/detail\/666$/);
  assert.deepEqual(row.leading.map((meta) => meta.type), ["workitem-type", "meegle-status"]);
  assert.equal(row.leading[1].subStage, "开发");
  const prMeta = row.trailing.find((meta) => meta.key === "pullRequests");
  assert.equal(prMeta.type, "pr-links");
  assert.equal(prMeta.pullRequests.length, 1);
  assert.deepEqual(row.trailing.map((meta) => meta.key), ["pullRequests", "sprint", "assignee", "updatedAt"]);
});

test("buildMeegleWorkitemRow omits empty optional trailing metadata", () => {
  const row = buildMeegleWorkitemRow({ projectKey: "p", workItemTypeKey: "bug", workItemId: "1" }, ["workitem", "pullRequests", "sprint", "assignee"]);
  assert.deepEqual(row.trailing, []);
  assert.equal(getMeegleWorkitemCategory({ workItemTypeKey: "bug" }), "bug");
  assert.match(row.href, /production_bug\/detail\/1$/);
});

test("buildGitHubPullRequestRow keeps labels, reviewers and meegle ids collapsible on the right", () => {
  const item = {
    owner: "tenways",
    repo: "octo",
    pullNumber: 42,
    title: "feat: rows",
    state: "open",
    isDraft: false,
    headRef: "feat/rows",
    baseRef: "main",
    authorLogin: "linyu",
    reviewers: ["a", "b", "c", "d"],
    labels: ["frontend", "urgent"],
    meegleIds: ["M-1", "M-2"],
    htmlUrl: "https://github.com/tenways/octo/pull/42",
    sourceUpdatedAt: "2026-08-03T10:00:00.000Z",
  };
  const row = buildGitHubPullRequestRow(item, ["pullRequest", "status", "labels", "repo", "branch", "author", "reviewers", "meegleWorkitems", "updatedAt"]);
  assert.equal(row.identifier, "#42");
  assert.equal(row.href, item.htmlUrl);
  assert.deepEqual(row.leading.map((meta) => meta.type), ["github-pr-status"]);
  const byKey = Object.fromEntries(row.trailing.map((meta) => [meta.key, meta]));
  assert.equal(byKey.labels.type, "github-labels");
  assert.deepEqual(byKey.labels.labels, ["frontend", "urgent"]);
  assert.equal(byKey.reviewers.type, "github-users");
  assert.deepEqual(byKey.reviewers.logins, ["a", "b", "c", "d"]);
  assert.equal(byKey.meegleWorkitems.type, "meegle-ids");
  assert.deepEqual(byKey.meegleWorkitems.ids, ["M-1", "M-2"]);
  assert.equal(byKey.repo.text, "tenways / octo");
  assert.equal(byKey.branch.text, "feat/rows → main");
  assert.equal(byKey.updatedAt.type, "date");
});

test("buildGitHubPullRequestRow skips absent people and collections without losing the date", () => {
  const row = buildGitHubPullRequestRow({ pullNumber: 7, state: "merged", sourceUpdatedAt: "2026-08-04T00:00:00.000Z" }, ["pullRequest", "status", "labels", "reviewers", "meegleWorkitems", "updatedAt"]);
  assert.deepEqual(row.trailing.map((meta) => meta.key), ["updatedAt"]);
});
