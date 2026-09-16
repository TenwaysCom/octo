import { buildApiUrl } from "../../app/runtime-config.js";

export async function searchPlatformData({ apiBaseUrl, query, kind, offset = 0, signal, fetchImpl = fetch }) {
  const params = new URLSearchParams({ q: query.trim(), limit: "20", offset: String(offset), actionRunId: crypto.randomUUID() });
  if (kind) params.set("kind", kind);
  const data = await readSearchData(`${buildApiUrl(apiBaseUrl, "/web/platform-data/search")}?${params}`, { signal, fetchImpl });
  if (!Array.isArray(data?.items) || typeof data.hasMore !== "boolean"
    || (data.hasMore && (!Number.isInteger(data.nextOffset) || data.nextOffset <= offset))
    || data.items.some((item) => !item || !["lark-tickets", "meegle-workitems", "github-pull-requests"].includes(item.kind)
      || ["title", "number", "status", "scope", "sourceId"].some((key) => typeof item[key] !== "string"))) {
    throw new Error("INVALID_PLATFORM_SEARCH_RESPONSE");
  }
  return data;
}

export async function getTicketFilterOptions({ apiBaseUrl, signal, fetchImpl = fetch }) {
  const data = await readSearchData(buildApiUrl(apiBaseUrl, "/web/platform-data/lark-ticket-filter-options"), { signal, fetchImpl });
  if (!data || ["requester", "responsible", "issueType"].some((key) => !Array.isArray(data[key]) || data[key].some((value) => typeof value !== "string"))) {
    throw new Error("INVALID_TICKET_FILTER_OPTIONS");
  }
  return data;
}

async function readSearchData(url, { signal, fetchImpl }) {
  const response = await fetchImpl(url, { credentials: "include", signal });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error?.errorCode || "PLATFORM_SEARCH_READ_FAILED");
  return payload.data;
}
