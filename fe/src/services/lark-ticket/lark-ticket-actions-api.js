import { buildApiUrl } from "../../app/runtime-config.js";

export const LARK_TICKET_ACTION_FIELDS = ["status", "responsible", "requester", "priority", "issueType", "businessLine"];

export async function loadLarkTicketFieldOptions({ apiBaseUrl, baseId, tableId, fetchImpl = fetch }) {
  const query = new URLSearchParams({ baseId, tableId });
  const response = await fetchImpl(`${buildApiUrl(apiBaseUrl, "/web/lark-tickets/field-options")}?${query}`, {
    credentials: "include",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || !Array.isArray(payload.data?.fields)) {
    throw apiError(payload, "LARK_TICKET_FIELD_OPTIONS_LOAD_FAILED");
  }
  return payload.data.fields;
}

export async function updateLarkTicketField({ apiBaseUrl, ticket, field, value, optionUserId, actionRunId, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, `/web/lark-tickets/${encodeURIComponent(ticket.recordId)}/fields`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseId: ticket.baseId,
      tableId: ticket.tableId,
      field,
      value,
      ...(optionUserId ? { optionUserId } : {}),
      actionRunId,
    }),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || payload.data?.larkBaseUpdated !== true) {
    throw apiError(payload, "LARK_TICKET_FIELD_UPDATE_FAILED");
  }
  return payload.data;
}

export async function createLarkTicketMeegleWorkitem({ apiBaseUrl, ticket, actionRunId, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, `/web/lark-tickets/${encodeURIComponent(ticket.recordId)}/create-meegle-workitem`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseId: ticket.baseId, tableId: ticket.tableId, actionRunId }),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok || typeof payload.data?.workitemId !== "string") {
    throw apiError(payload, "LARK_TICKET_CREATE_MEEGLE_FAILED");
  }
  return payload.data;
}

function apiError(payload, fallbackCode) {
  const error = new Error(payload?.error?.errorMessage || payload?.error?.errorCode || fallbackCode);
  error.code = payload?.error?.errorCode || fallbackCode;
  return error;
}
