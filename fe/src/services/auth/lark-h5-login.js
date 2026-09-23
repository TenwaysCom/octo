import { buildApiUrl } from "../../app/runtime-config.js";
import { getWebProfile } from "./lark-auth-api.js";

// Pinned to the official login-free web app sample; no JSAPI signing is needed for login.
const SDK_URL = "https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.26.js";
let sdkLoad;
const pendingLogins = new Map();
const LOGIN_ERRORS = new Set([
  "H5_SDK_LOAD_TIMEOUT", "H5_SDK_UNAVAILABLE", "H5_SDK_LOAD_FAILED", "H5_LOGIN_TIMEOUT",
  "H5_LOGIN_CODE_MISSING", "H5_LOGIN_UNSUPPORTED", "H5_LOGIN_DENIED", "H5_LOGIN_FAILED",
  "H5_LOGIN_SESSION_MISSING", "H5_LOGIN_ORIGIN_DENIED", "H5_LOGIN_CHALLENGE_INVALID",
  "H5_LOGIN_UNAVAILABLE", "H5_LOGIN_USER_UNAVAILABLE", "INVALID_REQUEST",
]);

function sdkErrorCodes(error) {
  const detail = {};
  for (const key of ["errno", "errorCode", "errCode", "code"]) {
    const value = error?.[key];
    if ((typeof value === "number" || (typeof value === "string" && /^-?\d{1,9}$/.test(value)))
      && Number.isSafeInteger(Number(value)) && Math.abs(Number(value)) <= 999999999) detail[`sdk_${key}`] = Number(value);
  }
  // Inspect only bounded SDK message fields; emit numbers and fixed labels, never text.
  const messages = [error?.errString, error?.errMsg, error?.message]
    .filter((value) => typeof value === "string").map((value) => value.slice(0, 4096));
  const innerCodes = messages.flatMap((message) => [...message.matchAll(/\berror\s+code\s*:\s*(-?\d{1,9})(?=\s*(?:;|,|$))/gi)]
    .map((match) => Number(match[1])));
  detail.sdk_innerErrorCodes = [...new Set(innerCodes)].slice(0, 8);
  const reasons = [
    ["INVALID_REDIRECT_URI", /\binvalid redirect uri\b/i],
    ["AUTHORIZATION_TERMINATED", /\bauthorization terminated unexpectedly\b/i],
    ["PERMISSION_DENIED", /\bpermission denied\b/i],
    ["INVALID_APP_ID", /\binvalid app[_ ]?id\b/i],
    ["INVALID_SCOPE", /\binvalid scope\b/i],
    ["USER_CANCELLED", /\buser (?:cancelled|canceled)\b/i],
  ];
  detail.sdk_reasonHints = reasons.filter(([, pattern]) => messages.some((message) => pattern.test(message)))
    .map(([reason]) => reason);
  return detail;
}

export async function uploadLarkLoginDiagnostic(apiBaseUrl, detail, fetchImpl = fetch) {
  try {
    await fetchImpl(buildApiUrl(apiBaseUrl, "/debug/client-log"), {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "fe", level: detail.status === "failed" ? "warn" : "info",
        event: "LARK_H5_LOGIN_DIAGNOSTIC", detail }),
      signal: AbortSignal.timeout(3000), keepalive: true,
    });
  } catch { /* Diagnostics must not interrupt login. */ }
}

export function isLarkClient(userAgent) {
  return /\b(?:Lark|Feishu)\//i.test(userAgent || "");
}

export function loadLarkLoginSdk(windowRef = window, documentRef = document) {
  if (windowRef.h5sdk && windowRef.tt) return Promise.resolve({ h5sdk: windowRef.h5sdk, tt: windowRef.tt });
  if (sdkLoad) return sdkLoad;
  sdkLoad = new Promise((resolve, reject) => {
    const script = documentRef.createElement("script");
    const finish = (error) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); reject(new Error(error)); }
      else resolve({ h5sdk: windowRef.h5sdk, tt: windowRef.tt });
    };
    const timer = setTimeout(() => finish("H5_SDK_LOAD_TIMEOUT"), 10000);
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => finish(windowRef.h5sdk && windowRef.tt ? null : "H5_SDK_UNAVAILABLE");
    script.onerror = () => finish("H5_SDK_LOAD_FAILED");
    documentRef.head.appendChild(script);
  });
  void sdkLoad.catch(() => { sdkLoad = undefined; });
  return sdkLoad;
}

export function requestLarkLoginCode({ h5sdk, tt, appId, timeoutMs = 60000, onDiagnostic = () => {} }) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let called = false;
    let usedFallback = false;
    let stage = "sdk.ready";
    const report = (status, detail = {}) => {
      try { onDiagnostic(stage, status, detail); } catch { /* Keep SDK callbacks independent of diagnostics. */ }
    };
    const finish = (error, code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      report(error ? "failed" : "completed", error ? { errorCode: error } : {});
      if (error) reject(new Error(error)); else resolve(code);
    };
    const timer = setTimeout(() => finish("H5_LOGIN_TIMEOUT"), timeoutMs);
    const success = (result) => typeof result?.code === "string" && result.code
      ? finish(null, result.code) : finish("H5_LOGIN_CODE_MISSING");
    const fallback = () => {
      if (finished || usedFallback) return;
      usedFallback = true;
      stage = "sdk.requestAuthCode";
      report("started");
      if (typeof tt?.requestAuthCode !== "function") return finish("H5_LOGIN_UNSUPPORTED");
      try { tt.requestAuthCode({ appId, success, fail: (error) => {
        if (finished) return;
        report("callback_failed", { callback: "requestAuthCode.fail", ...sdkErrorCodes(error) });
        finish("H5_LOGIN_DENIED");
      } }); }
      catch { finish("H5_LOGIN_UNSUPPORTED"); }
    };
    try {
      report("started");
      h5sdk.ready(() => {
        if (finished || called) return;
        called = true;
        report("completed");
        if (typeof tt?.requestAccess !== "function") return fallback();
        stage = "sdk.requestAccess";
        report("started");
        try {
          tt.requestAccess({ appID: appId, scopeList: [], success,
            fail: (error) => {
              if (finished || usedFallback) return;
              report("callback_failed", { callback: "requestAccess.fail", ...sdkErrorCodes(error) });
              if (error?.errno === 103) fallback(); else finish("H5_LOGIN_DENIED");
            },
          });
        } catch { finish("H5_LOGIN_UNSUPPORTED"); }
      });
    } catch { finish("H5_SDK_UNAVAILABLE"); }
  });
}

export async function performLarkH5Login({ apiBaseUrl, actionRunId, fetchImpl = fetch, loadSdk = loadLarkLoginSdk, onDiagnostic = () => {} }) {
  const startedAt = Date.now();
  let stage = "sdk.load";
  const report = (nextStage, status, detail = {}) => {
    stage = nextStage;
    try {
      void Promise.resolve(onDiagnostic({ diagnosticVersion: 2, actionRunId, layer: "fe", module: "lark-h5-login",
        operation: "lark-h5-login", stage, status, elapsedMs: Date.now() - startedAt, ...detail })).catch(() => {});
    } catch { /* Diagnostics must not interrupt login. */ }
  };
  const post = async (path, body) => {
    const response = await fetchImpl(buildApiUrl(apiBaseUrl, path), {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    report(stage, "response", { httpStatus: response.status });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) throw new Error(LOGIN_ERRORS.has(payload?.error?.errorCode) ? payload.error.errorCode : "H5_LOGIN_FAILED");
    return payload.data;
  };
  try {
    report("sdk.load", "started");
    const sdk = await loadSdk();
    report("sdk.load", "completed", { hasReady: typeof sdk.h5sdk?.ready === "function",
      hasRequestAccess: typeof sdk.tt?.requestAccess === "function", hasRequestAuthCode: typeof sdk.tt?.requestAuthCode === "function" });
    report("server.start", "started");
    const started = await post("/lark/auth/h5/start", { actionRunId });
    if (typeof started?.appId !== "string" || !started.appId || typeof started?.challengeId !== "string") throw new Error("H5_LOGIN_FAILED");
    report("server.start", "completed");
    const code = await requestLarkLoginCode({ ...sdk, appId: started.appId, onDiagnostic: report });
    report("server.complete", "started");
    await post("/lark/auth/h5/complete", { actionRunId, challengeId: started.challengeId, code });
    report("server.complete", "completed");
    report("session.profile", "started");
    const result = await getWebProfile({ apiBaseUrl, fetchImpl });
    if (!result.authenticated) throw new Error("H5_LOGIN_SESSION_MISSING");
    report("session.profile", "completed");
    return result;
  } catch (error) {
    report(stage, "failed", { errorCode: LOGIN_ERRORS.has(error?.message) ? error.message : "H5_LOGIN_FAILED" });
    throw error;
  }
}

export function loginWithLarkH5(apiBaseUrl) {
  if (pendingLogins.has(apiBaseUrl)) return pendingLogins.get(apiBaseUrl);
  const request = performLarkH5Login({ apiBaseUrl, actionRunId: crypto.randomUUID(),
    onDiagnostic: (detail) => uploadLarkLoginDiagnostic(apiBaseUrl, detail) });
  pendingLogins.set(apiBaseUrl, request);
  const clear = () => { if (pendingLogins.get(apiBaseUrl) === request) pendingLogins.delete(apiBaseUrl); };
  void request.then(clear, clear);
  return request;
}
