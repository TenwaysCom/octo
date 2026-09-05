import { buildApiUrl } from "../../app/runtime-config.js";

const PATH_BY_KIND = {
  "lark-tickets": "/web/platform-data/lark-tickets",
  "meegle-workitems": "/web/platform-data/meegle-workitems",
  "github-pull-requests": "/web/platform-data/github-pull-requests",
};
const PLATFORM_DATA_LIST_LIMIT = 500;
const pendingPlatformDataRequests = new Map();

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
  "sprintId",
  "sprint",
  "version",
  "system",
  "assignee",
  "priority",
  "createdAt",
  "sourceUpdatedAt",
  "addToCycleTime",
  "currentNodeStartTime",
  "itemStartTime",
  "itemFinishTime",
];

export function getPlatformDataList({ apiBaseUrl, kind, filters = {}, fetchImpl = fetch }) {
  const path = PATH_BY_KIND[kind];
  if (!path) {
    return Promise.reject(new Error("UNKNOWN_PLATFORM_DATA_KIND"));
  }

  const requestKey = `${buildApiUrl(apiBaseUrl, path)}?${buildListQuery(filters, 0)}&all=true`;
  return getSharedPlatformDataRequest(requestKey, () => loadPlatformDataList({ apiBaseUrl, kind, filters, fetchImpl }));
}

export function getPlatformDataListPage({ apiBaseUrl, kind, filters = {}, offset = 0, fetchImpl = fetch }) {
  const path = PATH_BY_KIND[kind];
  if (!path) {
    return Promise.reject(new Error("UNKNOWN_PLATFORM_DATA_KIND"));
  }

  const requestKey = `${buildApiUrl(apiBaseUrl, path)}?${buildListQuery(filters, offset)}`;
  return getSharedPlatformDataRequest(requestKey, () => loadPlatformDataListPage({ apiBaseUrl, kind, filters, offset, fetchImpl, path }));
}

export function getMeegleSprintHistory({ apiBaseUrl, fetchImpl = fetch }) {
  const url = buildApiUrl(apiBaseUrl, "/web/meegle-sprints");
  return getSharedPlatformDataRequest(`${url}#history`, () => loadMeegleSprintHistory(url, fetchImpl));
}

async function loadMeegleSprintHistory(url, fetchImpl) {
  const response = await fetchImpl(url, { credentials: "include" });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.errorCode || "MEEGLE_SPRINT_HISTORY_LOAD_FAILED");
  }
  if (!Array.isArray(payload.data?.sprintDetails) || !Array.isArray(payload.data?.sprintWorkitems)) {
    throw new Error("INVALID_MEEGLE_SPRINT_HISTORY_RESPONSE");
  }
  return {
    sprintDetails: payload.data.sprintDetails.map(parseMeegleSprint),
    sprintWorkitems: payload.data.sprintWorkitems.map(parseMeegleSprintWorkitem),
  };
}

export async function getGitHubPullRequestOdooShBuild({ apiBaseUrl, owner, repo, pullNumber, headRef, fetchImpl = fetch }) {
  const query = new URLSearchParams({ owner, repo, pullNumber: String(pullNumber) });
  if (headRef) query.set("headRef", headRef);
  const response = await fetchImpl(`${buildApiUrl(apiBaseUrl, "/web/github-pr-odoo-devops-build")}?${query}`, {
    credentials: "include",
  });
  const payload = await response.json().catch(() => undefined);
  if ((!response.ok && response.status !== 202) || !payload?.ok) {
    throw new Error(payload?.error?.errorCode || "ODOO_DEVOPS_BUILD_LOAD_FAILED");
  }
  return parseGitHubPullRequestOdooShBuild(payload.data);
}

export async function getGitHubPullRequestPreview({ apiBaseUrl, owner, repo, pullNumber, fetchImpl = fetch }) {
  const query = new URLSearchParams({ owner, repo, pullNumber: String(pullNumber) });
  const response = await fetchImpl(`${buildApiUrl(apiBaseUrl, "/web/platform-data/github-pull-request-preview")}?${query}`, {
    credentials: "include",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.errorCode || "GITHUB_PULL_REQUEST_PREVIEW_FAILED");
  }
  return parseSyncedGitHubPullRequest(payload.data);
}

export async function getMeeglePullRequestCandidates({
  apiBaseUrl,
  projectKey,
  workItemTypeKey,
  workItemId,
  fetchImpl = fetch,
}) {
  const query = new URLSearchParams({ projectKey, workItemTypeKey, workItemId });
  const response = await fetchImpl(`${buildApiUrl(apiBaseUrl, "/web/meegle-workitems/pull-request-candidates")}?${query}`, {
    credentials: "include",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || !isRecord(payload.data?.repository) || !Array.isArray(payload.data?.candidates)) {
    throw platformDataApiError(payload, "MEEGLE_PULL_REQUEST_CANDIDATES_FAILED");
  }
  if (typeof payload.data.repository.owner !== "string" || typeof payload.data.repository.repo !== "string") {
    throw new Error("INVALID_MEEGLE_PULL_REQUEST_CANDIDATES_RESPONSE");
  }
  return {
    repository: { owner: payload.data.repository.owner, repo: payload.data.repository.repo },
    candidates: payload.data.candidates.map((candidate) => {
      const pullRequest = parseMeeglePullRequestCandidate(candidate);
      if (typeof candidate.linked !== "boolean") throw new Error("INVALID_MEEGLE_PULL_REQUEST_CANDIDATES_RESPONSE");
      return { ...pullRequest, linked: candidate.linked };
    }),
  };
}

export async function linkMeeglePullRequest({
  apiBaseUrl,
  workitem,
  pullRequest,
  actionRunId,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/web/meegle-workitems/link-pull-request"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectKey: workitem.projectKey,
      workItemTypeKey: workitem.workItemTypeKey,
      workItemId: workitem.workItemId,
      owner: pullRequest.owner,
      repo: pullRequest.repo,
      pullNumber: pullRequest.pullNumber,
      actionRunId,
    }),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || !isRecord(payload.data)) {
    throw platformDataApiError(payload, "MEEGLE_PULL_REQUEST_LINK_FAILED");
  }
  if (payload.data.actionRunId !== actionRunId
    || typeof payload.data.marker !== "string"
    || typeof payload.data.titleUpdated !== "boolean") {
    throw new Error("INVALID_MEEGLE_PULL_REQUEST_LINK_RESPONSE");
  }
  return {
    actionRunId: payload.data.actionRunId,
    marker: payload.data.marker,
    titleUpdated: payload.data.titleUpdated,
    pullRequest: parseMeeglePullRequestCandidate(payload.data.pullRequest),
  };
}

function getSharedPlatformDataRequest(requestKey, load) {
  const pending = pendingPlatformDataRequests.get(requestKey);
  if (pending) return pending;

  const request = load();
  pendingPlatformDataRequests.set(requestKey, request);
  void request.then(
    () => { if (pendingPlatformDataRequests.get(requestKey) === request) pendingPlatformDataRequests.delete(requestKey); },
    () => { if (pendingPlatformDataRequests.get(requestKey) === request) pendingPlatformDataRequests.delete(requestKey); },
  );
  return request;
}

async function loadPlatformDataList({ apiBaseUrl, kind, filters, fetchImpl }) {
  const firstPage = await getPlatformDataListPage({ apiBaseUrl, kind, filters, fetchImpl });
  const items = [...firstPage.items];
  let sprints = firstPage.sprints || [];
  let relatedPersonOptions = firstPage.relatedPersonOptions || [];
  let sprintDetails = firstPage.sprintDetails || [];
  let sprintWorkitems = firstPage.sprintWorkitems || [];
  let pager = firstPage.pager;
  while (pager.hasMore) {
    const page = await getPlatformDataListPage({ apiBaseUrl, kind, filters, offset: pager.nextOffset, fetchImpl });
    items.push(...page.items);
    sprints = page.sprints || sprints;
    relatedPersonOptions = page.relatedPersonOptions || relatedPersonOptions;
    sprintDetails = page.sprintDetails || sprintDetails;
    sprintWorkitems = page.sprintWorkitems || sprintWorkitems;
    pager = page.pager;
  }
  return { items, ...(kind === "meegle-workitems" ? { sprints, relatedPersonOptions, sprintDetails, sprintWorkitems } : {}), pager };
}

async function loadPlatformDataListPage({ apiBaseUrl, kind, filters, offset, fetchImpl, path }) {
  const response = await fetchImpl(`${buildApiUrl(apiBaseUrl, path)}?${buildListQuery(filters, offset)}`, {
    credentials: "include",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || !Array.isArray(payload.data?.items)) {
    throw new Error(payload?.error?.errorCode || "PLATFORM_DATA_LOAD_FAILED");
  }
  const pager = parsePlatformDataPager(payload.data.pager, { offset, itemCount: payload.data.items.length });
  if (kind === "lark-tickets") {
    return { items: payload.data.items, pager };
  }
  if (kind === "github-pull-requests") {
    return { items: payload.data.items.map(parseSyncedGitHubPullRequest), pager };
  }
  if (!Array.isArray(payload.data.sprints) || payload.data.sprints.some((value) => typeof value !== "string")) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  if (payload.data.relatedPersonOptions !== undefined && !Array.isArray(payload.data.relatedPersonOptions)) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  if (payload.data.sprintDetails !== undefined && !Array.isArray(payload.data.sprintDetails)) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  if (payload.data.sprintWorkitems !== undefined && !Array.isArray(payload.data.sprintWorkitems)) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  const items = payload.data.items.map(parseMeegleWorkitem);
  return {
    items,
    sprints: payload.data.sprints,
    relatedPersonOptions: (payload.data.relatedPersonOptions || []).map(parseMeegleRelatedPersonOption),
    sprintDetails: (payload.data.sprintDetails || []).map(parseMeegleSprint),
    sprintWorkitems: payload.data.sprintWorkitems === undefined ? [] : payload.data.sprintWorkitems.map(parseMeegleSprintWorkitem),
    pager,
  };
}

function parsePlatformDataPager(value, { offset, itemCount }) {
  if (value === undefined) {
    return { offset, limit: PLATFORM_DATA_LIST_LIMIT, total: offset + itemCount, hasMore: false };
  }
  if (!isRecord(value)
    || value.offset !== offset
    || value.limit !== PLATFORM_DATA_LIST_LIMIT
    || !Number.isInteger(value.total)
    || value.total < offset + itemCount
    || typeof value.hasMore !== "boolean") {
    throw new Error("INVALID_PLATFORM_DATA_PAGINATION");
  }
  if (!value.hasMore) {
    return { offset, limit: value.limit, total: value.total, hasMore: false };
  }
  if (!Number.isInteger(value.nextOffset) || value.nextOffset <= offset || value.nextOffset > value.total) {
    throw new Error("INVALID_PLATFORM_DATA_PAGINATION");
  }
  return { offset, limit: value.limit, total: value.total, hasMore: true, nextOffset: value.nextOffset };
}

function buildListQuery(filters, offset) {
  const query = new URLSearchParams({ limit: String(PLATFORM_DATA_LIST_LIMIT) });
  if (offset) query.set("offset", String(offset));
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item) query.append(key, item);
      }
    } else if (value === true) {
      query.set(key, "true");
    } else if (typeof value === "string" && value) {
      query.set(key, value);
    }
  }
  return query;
}

export async function resetAllOdooDevopsBranchesCache({
  apiBaseUrl,
  actionRunId,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/web/odoo-devops-branches/reset-cache"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionRunId }),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || JSON.stringify(payload.data?.environments) !== JSON.stringify(["eu", "uk", "us"])) {
    throw new Error(payload?.error?.errorCode || "ODOO_DEVOPS_CACHE_RESET_FAILED");
  }
  return payload.data;
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
  if (value.relatedPeople !== undefined && !Array.isArray(value.relatedPeople)) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  item.relatedPeople = (value.relatedPeople || []).map(parseMeegleRelatedPeopleRole);
  return item;
}

function parseMeegleRelatedPeopleRole(value) {
  if (!isRecord(value)
    || typeof value.roleKey !== "string"
    || typeof value.roleName !== "string"
    || !Array.isArray(value.members)) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  return {
    roleKey: value.roleKey,
    roleName: value.roleName,
    members: value.members.map((member) => {
      if (!isRecord(member) || typeof member.memberKey !== "string" || typeof member.name !== "string") {
        throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
      }
      return { memberKey: member.memberKey, name: member.name };
    }),
  };
}

function parseMeegleRelatedPersonOption(value) {
  if (!isRecord(value)
    || typeof value.memberKey !== "string"
    || typeof value.name !== "string"
    || !Array.isArray(value.roleNames)
    || value.roleNames.some((roleName) => typeof roleName !== "string")) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  return { memberKey: value.memberKey, name: value.name, roleNames: value.roleNames };
}

function parseMeegleSprintWorkitem(value) {
  const item = parseMeegleWorkitem(value);
  if (typeof value.sprintId !== "string"
    || typeof value.sprint !== "string"
    || !["historical_inferred", "incremental_observed"].includes(value.membershipSource)
    || ["membershipRemovedAt", "carryoverToSprintId", "carryoverToSprintName"]
      .some((field) => value[field] !== undefined && typeof value[field] !== "string")) {
    throw new Error("INVALID_MEEGLE_WORKITEM_RESPONSE");
  }
  return {
    ...item,
    membershipSource: value.membershipSource,
    ...Object.fromEntries(["membershipRemovedAt", "carryoverToSprintId", "carryoverToSprintName"]
      .flatMap((field) => value[field] === undefined ? [] : [[field, value[field]]])),
  };
}

function parseMeegleSprint(value) {
  if (!isRecord(value)
    || typeof value.projectKey !== "string"
    || typeof value.sprintId !== "string"
    || typeof value.name !== "string"
    || typeof value.syncedAt !== "string"
    || ["projectName", "statusKey", "status", "description", "startAt", "endAt", "sourceUpdatedAt"]
      .some((field) => value[field] !== undefined && typeof value[field] !== "string")) {
    throw new Error("INVALID_MEEGLE_SPRINT_RESPONSE");
  }
  return {
    projectKey: value.projectKey,
    sprintId: value.sprintId,
    name: value.name,
    syncedAt: value.syncedAt,
    ...Object.fromEntries(["projectName", "statusKey", "status", "description", "startAt", "endAt", "sourceUpdatedAt"]
      .flatMap((field) => value[field] === undefined ? [] : [[field, value[field]]])),
  };
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
    || typeof value.isDraft !== "boolean"
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
    isDraft: value.isDraft,
    odooShBuilds: value.odooShBuilds,
  };
}

function parseMeeglePullRequestCandidate(value) {
  if (!isRecord(value)
    || typeof value.owner !== "string"
    || typeof value.repo !== "string"
    || !Number.isInteger(value.pullNumber)
    || typeof value.title !== "string"
    || typeof value.htmlUrl !== "string"
    || value.state !== "open"
    || typeof value.isDraft !== "boolean"
    || (value.authorLogin !== undefined && typeof value.authorLogin !== "string")
    || (value.headRef !== undefined && typeof value.headRef !== "string")
    || (value.baseRef !== undefined && typeof value.baseRef !== "string")) {
    throw new Error("INVALID_MEEGLE_PULL_REQUEST_CANDIDATES_RESPONSE");
  }
  return {
    owner: value.owner,
    repo: value.repo,
    pullNumber: value.pullNumber,
    title: value.title,
    htmlUrl: value.htmlUrl,
    state: value.state,
    isDraft: value.isDraft,
    ...(value.authorLogin === undefined ? {} : { authorLogin: value.authorLogin }),
    ...(value.headRef === undefined ? {} : { headRef: value.headRef }),
    ...(value.baseRef === undefined ? {} : { baseRef: value.baseRef }),
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
    || (value.description !== undefined && typeof value.description !== "string")
    || (value.authorLogin !== undefined && typeof value.authorLogin !== "string")
    || (value.mergedBy !== undefined && typeof value.mergedBy !== "string")
    || (value.reviewers !== undefined && (!Array.isArray(value.reviewers) || value.reviewers.some((reviewer) => typeof reviewer !== "string")))
    || (value.labels !== undefined && (!Array.isArray(value.labels) || value.labels.some((label) => typeof label !== "string")))
    || (value.headRef !== undefined && typeof value.headRef !== "string")
    || (value.baseRef !== undefined && typeof value.baseRef !== "string")
    || (value.sourceUpdatedAt !== undefined && typeof value.sourceUpdatedAt !== "string")
    || (value.meegleIds !== undefined && (!Array.isArray(value.meegleIds) || value.meegleIds.some((workItemId) => typeof workItemId !== "string")))
    || (value.meegleWorkitems !== undefined && !Array.isArray(value.meegleWorkitems))
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
    meegleIds: value.meegleIds || [],
    meegleWorkitems: (value.meegleWorkitems || []).map(parseGitHubLinkedMeegleWorkitem),
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.authorLogin === undefined ? {} : { authorLogin: value.authorLogin }),
    ...(value.mergedBy === undefined ? {} : { mergedBy: value.mergedBy }),
    ...(value.reviewers === undefined ? {} : { reviewers: value.reviewers }),
    ...(value.labels === undefined ? {} : { labels: value.labels }),
    ...(value.headRef === undefined ? {} : { headRef: value.headRef }),
    ...(value.baseRef === undefined ? {} : { baseRef: value.baseRef }),
    ...(value.sourceUpdatedAt === undefined ? {} : { sourceUpdatedAt: value.sourceUpdatedAt }),
    odooShBuilds: value.odooShBuilds,
  };
}

function parseGitHubLinkedMeegleWorkitem(value) {
  if (!isRecord(value)
    || typeof value.projectKey !== "string"
    || typeof value.workItemTypeKey !== "string"
    || typeof value.workItemId !== "string"
    || typeof value.title !== "string"
    || (value.projectName !== undefined && typeof value.projectName !== "string")
    || (value.workItemKey !== undefined && typeof value.workItemKey !== "string")
    || (value.workItemType !== undefined && typeof value.workItemType !== "string")
    || (value.status !== undefined && typeof value.status !== "string")
    || (value.sprint !== undefined && typeof value.sprint !== "string")
    || (value.version !== undefined && typeof value.version !== "string")) {
    throw new Error("INVALID_GITHUB_PULL_REQUEST_RESPONSE");
  }
  return {
    projectKey: value.projectKey,
    workItemTypeKey: value.workItemTypeKey,
    workItemId: value.workItemId,
    title: value.title,
    ...(value.projectName === undefined ? {} : { projectName: value.projectName }),
    ...(value.workItemKey === undefined ? {} : { workItemKey: value.workItemKey }),
    ...(value.workItemType === undefined ? {} : { workItemType: value.workItemType }),
    ...(value.status === undefined ? {} : { status: value.status }),
    ...(value.sprint === undefined ? {} : { sprint: value.sprint }),
    ...(value.version === undefined ? {} : { version: value.version }),
  };
}

function parseGitHubPullRequestOdooShBuild(value) {
  if (!isRecord(value)
    || !["ready", "refreshing"].includes(value.state)
    || !["eu", "uk", "us"].includes(value.environment)
    || typeof value.headRef !== "string"
    || (value.stale !== undefined && typeof value.stale !== "boolean")
    || (value.retryAfterMs !== undefined && (!Number.isInteger(value.retryAfterMs) || value.retryAfterMs < 1))
    || (value.build !== null && (!isRecord(value.build)
      || typeof value.build.branch !== "string"
      || typeof value.build.status !== "string"
      || typeof value.build.result !== "string"))) {
    throw new Error("INVALID_ODOO_DEVOPS_BUILD_RESPONSE");
  }
  return {
    state: value.state,
    environment: value.environment,
    headRef: value.headRef,
    build: value.build,
    ...(value.stale === undefined ? {} : { stale: value.stale }),
    ...(value.retryAfterMs === undefined ? {} : { retryAfterMs: value.retryAfterMs }),
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

function platformDataApiError(payload, fallbackCode) {
  const error = new Error(payload?.error?.errorMessage || payload?.error?.errorCode || fallbackCode);
  error.code = payload?.error?.errorCode || fallbackCode;
  return error;
}
