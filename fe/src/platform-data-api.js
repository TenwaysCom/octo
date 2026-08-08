import { buildApiUrl } from "./runtime-config.js";

const PATH_BY_KIND = {
  "lark-tickets": "/web/platform-data/lark-tickets",
  "meegle-workitems": "/web/platform-data/meegle-workitems",
  "github-pull-requests": "/web/platform-data/github-pull-requests",
};

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

  return payload.data.items;
}
