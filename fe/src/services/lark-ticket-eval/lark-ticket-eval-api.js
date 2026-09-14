import { buildApiUrl } from "../../app/runtime-config.js";

async function readData(response, fallbackCode) {
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.error?.errorCode || fallbackCode);
    error.code = payload?.error?.errorCode || fallbackCode;
    throw error;
  }
  return payload.data;
}

export async function listLarkTicketEvalSamples({ apiBaseUrl, fetchImpl = fetch }) {
  const data = await readData(await fetchImpl(buildApiUrl(apiBaseUrl, "/web/lark-ticket-eval-samples"), { credentials: "include" }), "EVAL_SAMPLE_LIST_FAILED");
  if (!Array.isArray(data?.samples)) throw new Error("INVALID_EVAL_SAMPLE_LIST");
  return data.samples;
}

export async function createLarkTicketEvalSample({ apiBaseUrl, ticket, actionRunId, fetchImpl = fetch }) {
  const data = await readData(await fetchImpl(buildApiUrl(apiBaseUrl, `/web/lark-tickets/${encodeURIComponent(ticket.recordId)}/eval-sample`), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseId: ticket.baseId, tableId: ticket.tableId, actionRunId }),
  }), "EVAL_SAMPLE_CREATE_FAILED");
  if (!data?.sample?.id) throw new Error("INVALID_EVAL_SAMPLE");
  return data.sample;
}

export async function updateLarkTicketEvalSample({ apiBaseUrl, sampleId, update, fetchImpl = fetch }) {
  const data = await readData(await fetchImpl(buildApiUrl(apiBaseUrl, `/web/lark-ticket-eval-samples/${encodeURIComponent(sampleId)}`), {
    method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update),
  }), "EVAL_SAMPLE_UPDATE_FAILED");
  if (!data?.sample?.id) throw new Error("INVALID_EVAL_SAMPLE");
  return data.sample;
}
