import { buildApiUrl } from "../../app/runtime-config.js";

async function readPayload(response) {
  return response.json().catch(() => undefined);
}

function createApiError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function requireSuccess(response, payload, fallbackCode) {
  if (!response.ok || !payload?.ok) {
    throw createApiError(payload?.error?.errorCode || fallbackCode, payload?.error?.errorMessage);
  }
  return payload.data;
}

export async function listUserSshPublicKeys({ apiBaseUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/web/ssh-public-keys"), { credentials: "include" });
  const data = requireSuccess(response, await readPayload(response), "SSH_PUBLIC_KEYS_LOAD_FAILED");
  if (!Array.isArray(data?.keys)) {
    throw createApiError("INVALID_SSH_PUBLIC_KEYS_RESPONSE", "Invalid SSH public key response.");
  }
  return data.keys;
}

export async function registerUserSshPublicKey({ apiBaseUrl, publicKey, label, actionRunId, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/web/ssh-public-keys"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey, ...(label ? { label } : {}), actionRunId }),
  });
  const data = requireSuccess(response, await readPayload(response), "SSH_PUBLIC_KEY_REGISTER_FAILED");
  if (!data?.key || typeof data.key.publicKey !== "string" || typeof data.key.publicKeyFingerprint !== "string") {
    throw createApiError("INVALID_SSH_PUBLIC_KEY_RESPONSE", "Invalid SSH public key response.");
  }
  return data.key;
}
