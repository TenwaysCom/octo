import { buildApiUrl } from "./runtime-config.js";

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

export async function getPlatformDataList({ apiBaseUrl, kind, fetchImpl = fetch }) {
  const path = PATH_BY_KIND[kind];
  if (!path) {
    throw new Error("UNKNOWN_PLATFORM_DATA_KIND");
  }

  const response = await fetchImpl(buildApiUrl(apiBaseUrl, path), {
    credentials: "include",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || !Array.isArray(payload.data?.items)) {
    throw new Error(payload?.error?.errorCode || "PLATFORM_DATA_LOAD_FAILED");
  }

  return kind === "meegle-workitems"
    ? payload.data.items.map(parseMeegleWorkitem)
    : payload.data.items;
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
  return item;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
