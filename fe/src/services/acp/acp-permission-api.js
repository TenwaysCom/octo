import { buildApiUrl } from "../../app/runtime-config.js";

export async function replyAcpPermission({ apiBaseUrl, sessionId, actionRunId, requestId, optionId, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/web/acp/permissions/reply"), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, actionRunId, requestId, optionId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.error?.errorMessage || "审批回复失败。");
    error.code = payload?.error?.errorCode || "ACP_PERMISSION_REPLY_FAILED";
    throw error;
  }
  return payload.data;
}
