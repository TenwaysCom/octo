import { buildApiUrl } from "../../app/runtime-config.js";

export async function loadLarkTicketSharedUrl({ apiBaseUrl, ticket, actionRunId = crypto.randomUUID(), fetchImpl = fetch }) {
  const query = new URLSearchParams({ baseId: ticket.baseId, tableId: ticket.tableId, actionRunId });
  const response = await fetchImpl(
    `${buildApiUrl(apiBaseUrl, `/web/lark-tickets/${encodeURIComponent(ticket.recordId)}/shared-url`)}?${query}`,
    { credentials: "include" },
  );
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || typeof payload.data?.sharedUrl !== "string") {
    const error = new Error(payload?.error?.errorMessage || "未能获取 Lark Base 链接，请检查 Lark 授权及记录访问权限后重试。");
    error.code = payload?.error?.errorCode || "LARK_TICKET_SHARED_URL_LOAD_FAILED";
    throw error;
  }
  return payload.data.sharedUrl;
}

export async function loadLarkTicketPreparedMessages({ apiBaseUrl, ticket, fetchImpl = fetch }) {
  const query = new URLSearchParams({ baseId: ticket.baseId, tableId: ticket.tableId });
  const response = await fetchImpl(
    `${buildApiUrl(apiBaseUrl, `/web/lark-tickets/${encodeURIComponent(ticket.recordId)}/prepared-messages`)}?${query}`,
    { credentials: "include" },
  );
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || !Array.isArray(payload.data?.messages)) {
    const error = new Error(payload?.error?.errorCode || "PREPARED_MESSAGES_LOAD_FAILED");
    error.code = payload?.error?.errorCode || "PREPARED_MESSAGES_LOAD_FAILED";
    throw error;
  }
  return payload.data;
}
