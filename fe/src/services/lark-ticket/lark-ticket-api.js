import { buildApiUrl } from "../../app/runtime-config.js";

export async function loadLarkTicketSharedUrl({ apiBaseUrl, ticket, fetchImpl = fetch }) {
  const query = new URLSearchParams({ baseId: ticket.baseId, tableId: ticket.tableId });
  const response = await fetchImpl(
    `${buildApiUrl(apiBaseUrl, `/web/lark-tickets/${encodeURIComponent(ticket.recordId)}/shared-url`)}?${query}`,
    { credentials: "include" },
  );
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || typeof payload.data?.sharedUrl !== "string") {
    throw new Error(payload?.error?.errorCode || "LARK_TICKET_SHARED_URL_LOAD_FAILED");
  }
  return payload.data.sharedUrl;
}
