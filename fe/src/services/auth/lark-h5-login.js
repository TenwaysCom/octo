import { buildApiUrl } from "../../app/runtime-config.js";
import { getWebProfile } from "./lark-auth-api.js";

// Pinned to the official login-free web app sample; no JSAPI signing is needed for login.
const SDK_URL = "https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.26.js";
let sdkLoad;
const pendingLogins = new Map();

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

export function requestLarkLoginCode({ h5sdk, tt, appId, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let called = false;
    let usedFallback = false;
    const finish = (error, code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(new Error(error)); else resolve(code);
    };
    const timer = setTimeout(() => finish("H5_LOGIN_TIMEOUT"), timeoutMs);
    const success = (result) => typeof result?.code === "string" && result.code
      ? finish(null, result.code) : finish("H5_LOGIN_CODE_MISSING");
    const fallback = () => {
      if (finished || usedFallback) return;
      usedFallback = true;
      if (typeof tt?.requestAuthCode !== "function") return finish("H5_LOGIN_UNSUPPORTED");
      try { tt.requestAuthCode({ appId, success, fail: () => finish("H5_LOGIN_DENIED") }); }
      catch { finish("H5_LOGIN_UNSUPPORTED"); }
    };
    try {
      h5sdk.ready(() => {
        if (finished || called) return;
        called = true;
        if (typeof tt?.requestAccess !== "function") return fallback();
        try {
          tt.requestAccess({ appID: appId, scopeList: [], success,
            fail: (error) => error?.errno === 103 ? fallback() : finish("H5_LOGIN_DENIED"),
          });
        } catch { finish("H5_LOGIN_UNSUPPORTED"); }
      });
    } catch { finish("H5_SDK_UNAVAILABLE"); }
  });
}

export async function performLarkH5Login({ apiBaseUrl, actionRunId, fetchImpl = fetch, loadSdk = loadLarkLoginSdk }) {
  const post = async (path, body) => {
    const response = await fetchImpl(buildApiUrl(apiBaseUrl, path), {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) throw new Error("H5_LOGIN_FAILED");
    return payload.data;
  };
  const sdk = await loadSdk();
  const started = await post("/lark/auth/h5/start", { actionRunId });
  if (typeof started?.appId !== "string" || !started.appId || typeof started?.challengeId !== "string") throw new Error("H5_LOGIN_FAILED");
  const code = await requestLarkLoginCode({ ...sdk, appId: started.appId });
  await post("/lark/auth/h5/complete", { actionRunId, challengeId: started.challengeId, code });
  const result = await getWebProfile({ apiBaseUrl, fetchImpl });
  if (!result.authenticated) throw new Error("H5_LOGIN_SESSION_MISSING");
  return result;
}

export function loginWithLarkH5(apiBaseUrl) {
  if (pendingLogins.has(apiBaseUrl)) return pendingLogins.get(apiBaseUrl);
  const request = performLarkH5Login({ apiBaseUrl, actionRunId: crypto.randomUUID() });
  pendingLogins.set(apiBaseUrl, request);
  const clear = () => { if (pendingLogins.get(apiBaseUrl) === request) pendingLogins.delete(apiBaseUrl); };
  void request.then(clear, clear);
  return request;
}
