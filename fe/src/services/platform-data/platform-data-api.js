import { buildApiUrl } from "../../app/runtime-config.js";

const PATH_BY_KIND = {
  "lark-tickets": "/web/platform-data/lark-tickets",
  "meegle-workitems": "/web/platform-data/meegle-workitems",
  "github-pull-requests": "/web/platform-data/github-pull-requests",
};

const MEEGLE_REQUIRED_STRING_FIELDS = [
  "projectKey",
  "workItemTypeKey",
  "workItemId",
  "title",
  "syncedAt",
];

const MEEGLE_OPTIONAL_STRING_FIELDS = [
  "projectName",
  "workItemKey",
  "workItemType",
  "statusKey",
  "status",
  "subStageKey",
  "subStage",
  "sprint",
  "version",
  "system",
  "assignee",
  "sourceUpdatedAt",
];

export async function getPlatformDataList({ apiBaseUrl, kind, sprint, fetchImpl = fetch }) {
  const path = PATH_BY_KIND[kind];
  if (!path) {
    throw new Error("UNKNOWN_PLATFORM_DATA_KIND");
  }

  const requestUrl = sprint && kind === "meegle-workitems"
    ? `${buildApiUrl(apiBaseUrl, path)}?${new URLSearchParams({ sprint })}`
    : buildApiUrl(apiBaseUrl, path);
  const response = await fetchImpl(requestUrl, {
    credentials: "include",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || !Array.isArray(payload.data?.items)) {
    throw new Error(payload?.error?.errorCode || "PLATFORM_DATA_LOAD_FAILED");
  }

  if (kind === "lark-tickets") {
    return { items: payload.data.items };
  }
  if (kind === "github-pull-requests") {
    return { items: payload.data.items.map(parseSyncedGitHubPullRequest) };
  }
  if (!Array.isArray(payload.data.sprints) || payload.data.sprints.some((value) => typeof value !== "string")) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  return {
    items: payload.data.items.map(parseMeegleWorkitem),
    sprints: payload.data.sprints,
  };
}

function parseMeegleWorkitem(value) {
  if (!isRecord(value)) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }

  const item = {};
  for (const field of MEEGLE_REQUIRED_STRING_FIELDS) {
    if (typeof value[field] !== "string") {
      throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
    }
    item[field] = value[field];
  }
  for (const field of MEEGLE_OPTIONAL_STRING_FIELDS) {
    if (value[field] === undefined) {
      continue;
    }
    if (typeof value[field] !== "string") {
      throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
    }
    item[field] = value[field];
  }
  if (value.bugs !== undefined) {
    if (!Array.isArray(value.bugs) || value.bugs.some((bug) => typeof bug !== "string")) {
      throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
    }
    item.bugs = value.bugs;
  }
  if (!Array.isArray(value.githubPullRequests)) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  item.githubPullRequests = value.githubPullRequests.map(parseGitHubPullRequest);
  return item;
}

function parseGitHubPullRequest(value) {
  if (!isRecord(value)
    || typeof value.owner !== "string"
    || typeof value.repo !== "string"
    || !Number.isInteger(value.pullNumber)
    || typeof value.title !== "string"
    || typeof value.htmlUrl !== "string"
    || (value.headRef !== undefined && typeof value.headRef !== "string")
    || (value.baseRef !== undefined && typeof value.baseRef !== "string")
    || typeof value.state !== "string"
    || !Array.isArray(value.odooShBuilds)
    || value.odooShBuilds.some((build) => !isOdooShBuild(build))) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  return {
    owner: value.owner,
    repo: value.repo,
    pullNumber: value.pullNumber,
    title: value.title,
    htmlUrl: value.htmlUrl,
    ...(value.headRef === undefined ? {} : { headRef: value.headRef }),
    ...(value.baseRef === undefined ? {} : { baseRef: value.baseRef }),
    state: value.state,
    odooShBuilds: value.odooShBuilds,
  };
}

function parseSyncedGitHubPullRequest(value) {
  if (!isRecord(value)
    || typeof value.owner !== "string"
    || typeof value.repo !== "string"
    || !Number.isInteger(value.pullNumber)
    || typeof value.title !== "string"
    || typeof value.state !== "string"
    || typeof value.htmlUrl !== "string"
    || typeof value.isDraft !== "boolean"
    || typeof value.syncedAt !== "string"
    || (value.authorLogin !== undefined && typeof value.authorLogin !== "string")
    || (value.headRef !== undefined && typeof value.headRef !== "string")
    || (value.baseRef !== undefined && typeof value.baseRef !== "string")
    || (value.sourceUpdatedAt !== undefined && typeof value.sourceUpdatedAt !== "string")
    || !Array.isArray(value.odooShBuilds)
    || value.odooShBuilds.some((build) => !isOdooShBuild(build))) {
    throw new Error("INVALID_GITHUB_PULL_REQUEST_RESPONSE");
  }

  return {
    owner: value.owner,
    repo: value.repo,
    pullNumber: value.pullNumber,
    title: value.title,
    state: value.state,
    htmlUrl: value.htmlUrl,
    isDraft: value.isDraft,
    syncedAt: value.syncedAt,
    ...(value.authorLogin === undefined ? {} : { authorLogin: value.authorLogin }),
    ...(value.headRef === undefined ? {} : { headRef: value.headRef }),
    ...(value.baseRef === undefined ? {} : { baseRef: value.baseRef }),
    ...(value.sourceUpdatedAt === undefined ? {} : { sourceUpdatedAt: value.sourceUpdatedAt }),
    odooShBuilds: value.odooShBuilds,
  };
}

function isOdooShBuild(value) {
  return isRecord(value)
    && ["eu", "uk", "us"].includes(value.environment)
    && typeof value.status === "string"
    && typeof value.result === "string";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
