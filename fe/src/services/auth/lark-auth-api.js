import { buildApiUrl } from "../../app/runtime-config.js";

const pendingWebProfileRequests = new Map();

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

export function getWebProfile({ apiBaseUrl, fetchImpl = fetch }) {
  const requestUrl = buildApiUrl(apiBaseUrl, "/web/profile");
  const pending = pendingWebProfileRequests.get(requestUrl);
  if (pending) return pending;

  const request = loadWebProfile({ requestUrl, fetchImpl });
  pendingWebProfileRequests.set(requestUrl, request);
  void request.then(
    () => { if (pendingWebProfileRequests.get(requestUrl) === request) pendingWebProfileRequests.delete(requestUrl); },
    () => { if (pendingWebProfileRequests.get(requestUrl) === request) pendingWebProfileRequests.delete(requestUrl); },
  );
  return request;
}

async function loadWebProfile({ requestUrl, fetchImpl }) {
  const response = await fetchImpl(requestUrl, {
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

export async function startOctoPluginLogin({ apiBaseUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/web/plugin-login/start"), {
    method: "POST",
    credentials: "include",
  });
  const payload = await readPayload(response);
  if (!response.ok || !payload?.ok || typeof payload.data?.challengeId !== "string") {
    throw new Error(payload?.error?.errorCode || "PLUGIN_LOGIN_START_FAILED");
  }

  return payload.data;
}

export async function completeOctoPluginLogin({ apiBaseUrl, challengeId, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/web/plugin-login/complete"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId }),
  });
  const payload = await readPayload(response);

  return Boolean(response.ok && payload?.ok && payload.data?.loggedIn);
}

export async function logoutWebAuthSession({ apiBaseUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/lark/auth/web/logout"), {
    method: "POST",
    credentials: "include",
  });
  return response.ok;
}
