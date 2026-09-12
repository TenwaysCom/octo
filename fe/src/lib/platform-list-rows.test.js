import assert from "node:assert/strict";
import test from "node:test";
import {
  ROW_OVERFLOW_LIMIT,
  buildGitHubPullRequestRow,
  buildLarkTicketRow,
  buildMeegleWorkitemRow,
  getMeegleStatusTone,
  getMeegleWorkitemCategory,
  getAutoBadgeTone,
  splitOverflowItems,
} from "./platform-list-rows.js";

test("getMeegleStatusTone keeps Meegle status badges consistent", () => {
  assert.equal(getMeegleStatusTone("Done"), "completed");
  assert.equal(getMeegleStatusTone("Server Launch"), "release");
  assert.equal(getMeegleStatusTone("Feature Draft"), "planning");
  assert.equal(getMeegleStatusTone("QA Testing"), "review");
  assert.equal(getMeegleStatusTone("Doing"), "active");
  assert.equal(getMeegleStatusTone("Blocked"), "default");
});

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
    businessLine: "B2B sales",
    priority: "P1",
    requester: "张三",
    responsible: "李四",
    sourceUpdatedAt: "2026-08-01T10:00:00.000Z",
  };
  const row = buildLarkTicketRow(item, ["title", "status", "issueType", "businessLine", "requester", "responsible", "priority", "updatedAt"]);
  assert.equal(row.kind, "lark-tickets");
  assert.equal(row.identifier, "T-10086");
  assert.equal(row.title, "登录失败");
  assert.equal(row.href, "#lark-tickets/rec123");
  assert.equal(row.external, false);
  assert.deepEqual(row.leading.map((meta) => meta.key), ["issueType", "priority", "status"]);
  assert.deepEqual(row.trailing.map((meta) => meta.key), ["businessLine", "requester", "responsible", "updatedAt"]);
  assert.equal(row.trailing[0].value, "B2B sales");
  assert.equal(row.trailing[0].kind, "business-line");
  assert.deepEqual(row.leading.map((meta) => meta.type), ["lark-badge", "lark-badge", "lark-badge"]);
});

test("buildLarkTicketRow respects visible columns", () => {
  const row = buildLarkTicketRow({ recordId: "rec1", title: "t" }, ["title", "status"]);
  assert.deepEqual(row.leading.map((meta) => meta.key), ["status"]);
  assert.deepEqual(row.trailing, []);
  assert.equal(buildLarkTicketRow({}, ["businessLine"]).trailing[0].value, undefined);
  const detailed = buildLarkTicketRow({ createdAt: "2026-01-01T00:00:00Z", solution: "修复配置" }, ["createdAt", "closedAt", "solution"]);
  assert.deepEqual(detailed.trailing.map((meta) => meta.key), ["createdAt", "closedAt", "solution"]);
  assert.equal(detailed.trailing[0].text.startsWith("创建 "), true);
  assert.equal(detailed.trailing[1].text, "关闭 -");
  assert.equal(detailed.trailing[2].text, "修复配置");
});

test("getAutoBadgeTone assigns stable tones within the seven-colour cycle", () => {
  assert.equal(getAutoBadgeTone(""), undefined);
  assert.equal(getAutoBadgeTone("   "), undefined);
  assert.equal(getAutoBadgeTone("Sprint 12"), getAutoBadgeTone("Sprint 12"));
  for (const value of ["Sprint 1", "Sprint 2", "Sprint 10", "Sprint 21", "2.11.0", "2.11.5"]) {
    const tone = getAutoBadgeTone(value);
    assert.ok(Number.isInteger(tone) && tone >= 0 && tone < 7, `${value} should map into 0-6`);
  }
  const tones = new Set(["Sprint 1", "Sprint 2", "Sprint 3", "Sprint 4", "Sprint 5"].map(getAutoBadgeTone));
  assert.ok(tones.size >= 3, "consecutive sprints should spread over several tones");
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
    version: "2.11.0",
    system: "Odoo/Odoo UK",
    assignee: "王五",
    relatedPeople: [{ roleKey: "developer", roleName: "Developer", members: [{ memberKey: "user-1", name: "赵六" }] }],
    currentNodeStartTime: "2026-08-02T08:30:00.000Z",
    createdAt: "2026-08-01T09:00:00.000Z",
    githubPullRequests: [
      { owner: "tenways", repo: "octo", pullNumber: 1, htmlUrl: "https://github.com/tenways/octo/pull/1", state: "open" },
    ],
    sourceUpdatedAt: "2026-08-02T10:00:00.000Z",
  };
  const row = buildMeegleWorkitemRow(item, ["workitem", "workitemType", "status", "pullRequests", "sprint", "version", "system", "assignee", "relatedPeople", "currentWorkingTime", "createdAt", "updatedAt"], Date.parse("2026-08-02T10:00:00.000Z"));
  assert.equal(row.kind, "meegle-workitems");
  assert.equal(row.identifier, "OCTO-666");
  assert.equal(row.external, true);
  assert.match(row.href, /^https:\/\/project\.larksuite\.com\/octo\/story\/detail\/666$/);
  assert.deepEqual(row.leading.map((meta) => meta.type), ["workitem-type", "meegle-status"]);
  assert.equal(row.leading[1].subStage, "开发");
  const prMeta = row.trailing.find((meta) => meta.key === "pullRequests");
  assert.equal(prMeta.type, "pr-links");
  assert.equal(prMeta.pullRequests.length, 1);
  assert.equal(prMeta.canAddMore, true);
  assert.deepEqual(row.trailing.map((meta) => meta.key), ["pullRequests", "sprint", "version", "system", "assignee", "relatedPeople", "currentWorkingTime", "createdAt", "updatedAt"]);
  assert.deepEqual(row.trailing.find((meta) => meta.key === "relatedPeople").relatedPeople, item.relatedPeople);
  assert.equal(row.trailing.find((meta) => meta.key === "assignee").type, "lark-users");
  assert.equal(row.trailing.find((meta) => meta.key === "system").type, "system-badge");
  assert.equal(row.trailing.find((meta) => meta.key === "sprint").type, "auto-badge");
  assert.equal(row.trailing.find((meta) => meta.key === "version").type, "auto-badge");
  assert.equal(row.trailing.find((meta) => meta.key === "currentWorkingTime").text, "工作 1小时 30分钟");
});

test("buildMeegleWorkitemRow reserves the PR picker while omitting other empty metadata", () => {
  const row = buildMeegleWorkitemRow({ projectKey: "p", workItemTypeKey: "bug", workItemId: "1" }, ["workitem", "pullRequests", "sprint", "assignee"]);
  assert.deepEqual(row.trailing, [{ key: "pullRequests", type: "pr-picker" }]);
  assert.equal(getMeegleWorkitemCategory({ workItemTypeKey: "bug" }), "bug");
  assert.match(row.href, /production_bug\/detail\/1$/);
});

test("buildMeegleWorkitemRow drops the add-PR entry once three PRs are linked", () => {
  const columns = ["pullRequests"];
  const pullRequest = { owner: "tenways", repo: "octo", pullNumber: 1, htmlUrl: "https://github.com/tenways/octo/pull/1", state: "open" };
  const two = buildMeegleWorkitemRow({ projectKey: "p", workItemTypeKey: "story", workItemId: "1", githubPullRequests: [pullRequest, { ...pullRequest, pullNumber: 2 }] }, columns);
  assert.equal(two.trailing[0].canAddMore, true);
  const three = buildMeegleWorkitemRow({ projectKey: "p", workItemTypeKey: "story", workItemId: "1", githubPullRequests: [pullRequest, { ...pullRequest, pullNumber: 2 }, { ...pullRequest, pullNumber: 3 }] }, columns);
  assert.equal(three.trailing[0].canAddMore, false);
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
