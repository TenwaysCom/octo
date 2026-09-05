import { getLarkTicketDetailHash } from "../app/routes/workspace-routes.js";
import { formatDateTime } from "./formatters.js";
import { formatMeegleCurrentWorkingTime } from "./meegle-current-working-time.js";

// Row models for the compact single-line list rendering on platform list pages.
// Builders are pure: they respect the page's visible-column config and reuse the
// same fields the previous table cells rendered, so filters/sort/group behavior
// stay untouched. Each row is one horizontal flow: `leading` (type/status/priority
// badges) + identifier + title on the left, `trailing` (PRs, tags, people, date)
// right-aligned.

export const ROW_OVERFLOW_LIMIT = 3;

// Splits a trailing collection (related PRs, labels, reviewers, …) into the
// inline-visible head and the overflow shown behind a "+N" popover, so no data
// is truncated or lost.
export function splitOverflowItems(items, limit = ROW_OVERFLOW_LIMIT) {
  const list = Array.isArray(items) ? items : [];
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : ROW_OVERFLOW_LIMIT;
  return { visible: list.slice(0, safeLimit), overflow: list.slice(safeLimit) };
}

export function getMeegleWorkitemCategory(item) {
  if (item.workItemTypeKey === "story") {
    return "story";
  }
  const type = `${item.workItemType || ""} ${item.workItemTypeKey || ""}`.toLocaleLowerCase();
  if (type.includes("tech task")) {
    return "tech-task";
  }
  if (type.includes("bug")) {
    return "bug";
  }
  return "other";
}

export function getMeegleStatusTone(status) {
  const normalized = String(status || "").toLocaleLowerCase();
  if (["done", "ended", "fixed", "launched"].includes(normalized)) return "completed";
  if (["fe launch", "server launch"].includes(normalized)) return "release";
  if (normalized.includes("design") || ["feature draft", "new", "to start"].includes(normalized)) return "planning";
  if (normalized.includes("review") || normalized.includes("testing") || normalized.includes("check")) return "review";
  if (normalized.includes("doing") || normalized.includes("ongoing") || normalized.includes("development")) return "active";
  return "default";
}

export function getMeegleWorkitemDetailUrl(item) {
  const urlSlugByCategory = {
    story: "story",
    "tech-task": "techtask",
    bug: "production_bug",
  };
  const urlSlug = urlSlugByCategory[getMeegleWorkitemCategory(item)] || item.workItemTypeKey;
  return `https://project.larksuite.com/${encodeURIComponent(item.projectKey)}/${encodeURIComponent(urlSlug)}/detail/${encodeURIComponent(item.workItemId)}`;
}

function dateMeta(item) {
  const value = item.sourceUpdatedAt || item.syncedAt || "";
  return { key: "updatedAt", type: "date", value, text: formatDateTime(value) };
}

function createdDateMeta(item) {
  const value = item.createdAt || "";
  return { key: "createdAt", type: "date", value, text: formatDateTime(value), title: "创建时间" };
}

export function buildLarkTicketRow(item, visibleColumns = []) {
  const visible = new Set(visibleColumns);
  const leading = [];
  if (visible.has("issueType")) leading.push({ key: "issueType", type: "lark-badge", kind: "type", value: item.issueType });
  if (visible.has("priority")) leading.push({ key: "priority", type: "lark-badge", kind: "priority", value: item.priority });
  if (visible.has("status")) leading.push({ key: "status", type: "lark-badge", kind: "status", value: item.ticketStatus });
  const trailing = [];
  if (visible.has("requester")) trailing.push({ key: "requester", type: "lark-users", value: item.requester, hideOnSmall: true });
  if (visible.has("responsible")) trailing.push({ key: "responsible", type: "lark-users", value: item.responsible });
  if (visible.has("updatedAt")) trailing.push(dateMeta(item));
  return {
    kind: "lark-tickets",
    title: item.title || item.ticketNumber || item.recordId || "未命名 Ticket",
    identifier: item.ticketNumber || item.recordId || "",
    href: item.recordId ? getLarkTicketDetailHash(item.recordId) : null,
    external: false,
    leading,
    trailing,
  };
}

export function buildMeegleWorkitemRow(item, visibleColumns = [], nowTime = Date.now()) {
  const visible = new Set(visibleColumns);
  const leading = [];
  if (visible.has("workitemType")) leading.push({ key: "workitemType", type: "workitem-type", category: getMeegleWorkitemCategory(item), label: item.workItemType || item.workItemTypeKey || "-" });
  if (visible.has("status")) leading.push({ key: "status", type: "meegle-status", value: item.status, subStage: item.subStage || "" });
  const trailing = [];
  if (visible.has("pullRequests") && item.githubPullRequests?.length) {
    trailing.push({ key: "pullRequests", type: "pr-links", pullRequests: item.githubPullRequests });
  } else if (visible.has("pullRequests")) {
    trailing.push({ key: "pullRequests", type: "pr-picker" });
  }
  const textColumns = [
    ["sprint", item.sprint, false],
    ["version", item.version, true],
    ["system", item.system, false],
    ["assignee", item.assignee, false],
  ];
  for (const [columnKey, value, hideOnSmall] of textColumns) {
    if (visible.has(columnKey) && value) trailing.push({ key: columnKey, type: "text", text: value, hideOnSmall });
  }
  if (visible.has("relatedPeople") && item.relatedPeople?.length) {
    trailing.push({ key: "relatedPeople", type: "related-people", relatedPeople: item.relatedPeople });
  }
  const currentWorkingTime = formatMeegleCurrentWorkingTime(item, nowTime);
  if (visible.has("currentWorkingTime") && currentWorkingTime) {
    trailing.push({
      key: "currentWorkingTime",
      type: "text",
      text: `工作 ${currentWorkingTime}`,
      title: `当前节点开始：${formatDateTime(item.currentNodeStartTime)}`,
    });
  }
  if (visible.has("createdAt")) trailing.push(createdDateMeta(item));
  if (visible.has("updatedAt")) trailing.push(dateMeta(item));
  return {
    kind: "meegle-workitems",
    title: item.title || item.workItemKey || item.workItemId || "未命名工作项",
    identifier: item.workItemKey || item.workItemId || "",
    href: getMeegleWorkitemDetailUrl(item),
    external: true,
    leading,
    trailing,
  };
}

export function buildGitHubPullRequestRow(item, visibleColumns = []) {
  const visible = new Set(visibleColumns);
  const leading = [];
  if (visible.has("status")) leading.push({ key: "status", type: "github-pr-status", isDraft: Boolean(item.isDraft), state: item.state });
  const trailing = [];
  if (visible.has("labels") && item.labels?.length) trailing.push({ key: "labels", type: "github-labels", labels: item.labels });
  const repo = [item.owner, item.repo].filter(Boolean).join(" / ");
  if (visible.has("repo") && repo) trailing.push({ key: "repo", type: "text", text: repo });
  if (visible.has("branch") && item.headRef) {
    trailing.push({ key: "branch", type: "text", text: item.baseRef ? `${item.headRef} → ${item.baseRef}` : item.headRef, hideOnSmall: true });
  }
  if (visible.has("author") && item.authorLogin) trailing.push({ key: "author", type: "github-user", login: item.authorLogin });
  if (visible.has("mergedBy") && item.mergedBy) trailing.push({ key: "mergedBy", type: "github-user", login: item.mergedBy, hideOnSmall: true });
  if (visible.has("reviewers") && item.reviewers?.length) trailing.push({ key: "reviewers", type: "github-users", logins: item.reviewers, hideOnSmall: true });
  if (visible.has("meegleWorkitems") && item.meegleIds?.length) {
    trailing.push({ key: "meegleWorkitems", type: "meegle-ids", ids: item.meegleIds, hideOnSmall: true });
  }
  if (visible.has("updatedAt")) trailing.push(dateMeta(item));
  return {
    kind: "github-pull-requests",
    title: item.title || `#${item.pullNumber}`,
    identifier: item.pullNumber ? `#${item.pullNumber}` : "",
    href: item.htmlUrl || null,
    external: true,
    leading,
    trailing,
  };
}
