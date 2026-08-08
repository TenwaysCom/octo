import { buildApiUrl } from "./runtime-config.js";

async function readPayload(response) {
  return response.json().catch(() => undefined);
}

export async function getWebAuthSession({ apiBaseUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/lark/auth/web/ensure"), {
    credentials: "include",
  });
  const payload = await readPayload(response);

  if (!response.ok || !payload?.ok) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    user: payload.data?.user ?? {},
  };
}

export async function getWebProfile({ apiBaseUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/web/profile"), {
    credentials: "include",
  });
  const payload = await readPayload(response);

  if (!response.ok || !payload?.ok || !payload.data) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    profile: payload.data,
  };
}

export async function getExtensionDownloadInfo({ apiBaseUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/extension/version"));
  const payload = await readPayload(response);
  const downloadUrl = payload?.ok && typeof payload.data?.downloadUrl === "string"
    ? payload.data.downloadUrl
    : "";

  return { downloadUrl };
}

export function startLarkLogin({ apiBaseUrl, locationRef = window.location }) {
  locationRef.assign(buildApiUrl(apiBaseUrl, "/lark/auth/web/start"));
}

export async function logoutWebAuthSession({ apiBaseUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/lark/auth/web/logout"), {
    method: "POST",
    credentials: "include",
  });
  return response.ok;
}
