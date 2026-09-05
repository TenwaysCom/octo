import { buildApiUrl } from "../../app/runtime-config.js";

async function readPayload(response) {
  return response.json().catch(() => undefined);
}

export async function getPlatformSyncSources({ apiBaseUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/web/platform-sync-sources"), { credentials: "include" });
  const payload = await readPayload(response);
  if (!response.ok || !payload?.ok || !Array.isArray(payload.data?.sources)) {
    throw new Error(payload?.error?.errorCode || "SYNC_SOURCES_LOAD_FAILED");
  }
  return { sources: payload.data.sources, shadowSummary: payload.data.shadowSummary };
}

export async function syncPlatformSource({ apiBaseUrl, sourceId, actionRunId, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, `/web/platform-sync-sources/${sourceId}`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionRunId }),
  });
  const payload = await readPayload(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.errorCode || "SYNC_FAILED");
  }
  return payload.data;
}
