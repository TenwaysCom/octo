import { buildApiUrl } from "../../app/runtime-config.js";
import { isLarkClient, loadLarkLoginSdk } from "./lark-h5-login.js";

const pendingContexts = new Map();
const scenes = ["chat_action", "plus_menu_p2p", "plus_menu_group", "message_action"];

export function readLarkChatLaunch(href) {
  const query = new URL(href).searchParams;
  const scene = [query.get("from"), query.get("required_launch_ability")].find((value) => scenes.includes(value)) || "unknown";
  if (scene === "message_action") return { scene, errorCode: "MESSAGE_ACTION_UNSUPPORTED" };
  if (scene === "unknown") return { scene, errorCode: "CHAT_ENTRY_REQUIRED" };
  let launch;
  try { launch = JSON.parse(query.get("bdp_launch_query") || "null"); }
  catch { return { scene, errorCode: "INVALID_LAUNCH_QUERY" }; }
  const triggerCode = launch?.__trigger_id__;
  if (typeof triggerCode !== "string" || !triggerCode || triggerCode.length > 4096) return { scene, errorCode: "MISSING_TRIGGER_CODE" };
  return { scene, triggerCode };
}

export function getSignedChatContext({ h5sdk, tt, config, triggerCode, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let ready = false;
    let authenticated = false;
    let called = false;
    const finish = (errorCode, openChatId) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (errorCode) reject(new Error(errorCode)); else resolve(openChatId);
    };
    const timer = setTimeout(() => finish(called ? "CHAT_CONTEXT_TIMEOUT" : "H5_CONFIG_TIMEOUT"), timeoutMs);
    const getContext = () => {
      if (finished || called || !ready || !authenticated) return;
      called = true;
      try {
        tt.getTriggerContext({ triggerCode,
          success: (result) => {
            const id = result?.openChatId;
            finish(typeof id === "string" && /^oc_[a-zA-Z0-9_-]{1,128}$/.test(id) ? null : "INVALID_OPEN_CHAT_ID", id);
          },
          fail: () => finish("CHAT_CONTEXT_FAILED"),
        });
      } catch { finish("CHAT_CONTEXT_UNAVAILABLE"); }
    };
    try {
      h5sdk.error(() => finish("H5_CONFIG_FAILED"));
      h5sdk.config({
        appId: config.appId, timestamp: config.timestamp, nonceStr: config.nonceStr, signature: config.signature,
        jsApiList: ["getTriggerContext"],
        onSuccess: () => { authenticated = true; getContext(); },
        onFail: () => finish("H5_CONFIG_FAILED"),
      });
      // Login may already have fired ready, so require config.onSuccess as well.
      h5sdk.ready(() => { ready = true; getContext(); });
    } catch { finish("H5_CONFIG_UNAVAILABLE"); }
  });
}

const safeErrors = new Set(["H5_CONFIG_TIMEOUT", "CHAT_CONTEXT_TIMEOUT", "H5_CONFIG_FAILED", "H5_CONFIG_UNAVAILABLE", "CHAT_CONTEXT_FAILED", "CHAT_CONTEXT_UNAVAILABLE", "INVALID_OPEN_CHAT_ID"]);

export async function collectLarkChatContext({ apiBaseUrl, href, userAgent, actionRunId, fetchImpl = fetch, loadSdk = loadLarkLoginSdk }) {
  const launch = readLarkChatLaunch(href);
  let errorCode = !isLarkClient(userAgent) ? "NOT_LARK_CLIENT" : launch.errorCode;
  let openChatId = null;
  let stage = "launch";
  if (!errorCode) {
    try {
      stage = "sdk";
      const sdk = await loadSdk();
      stage = "signature";
      const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/lark/auth/h5/signature"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        // Preserve query encoding byte-for-byte. Never log this URL or its trigger code.
        body: JSON.stringify({ url: href.split("#")[0], actionRunId }), signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json();
      const config = payload?.data;
      if (!response.ok || !payload?.ok || typeof config?.appId !== "string" || !Number.isFinite(config.timestamp) || typeof config.nonceStr !== "string" || typeof config.signature !== "string") throw new Error("H5_SIGNATURE_FAILED");
      stage = "context";
      openChatId = await getSignedChatContext({ ...sdk, config, triggerCode: launch.triggerCode });
    } catch (error) {
      errorCode = safeErrors.has(error?.message) ? error.message : stage === "sdk" ? "H5_SDK_UNAVAILABLE" : "H5_SIGNATURE_FAILED";
    }
  }
  const detail = { actionRunId, layer: "fe", module: "lark-app", stage, scene: launch.scene,
    status: openChatId ? "available" : "unavailable", openChatId, errorCode: errorCode || null };
  let logged = false;
  try {
    const response = await fetchImpl(buildApiUrl(apiBaseUrl, "/debug/client-log"), {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "lark-app", level: "info", event: "LARK_APP_OPEN_CHAT_CONTEXT", detail }), signal: AbortSignal.timeout(5000),
    });
    logged = response.ok;
  } catch { /* Logging must not block Ticket search. */ }
  return { ...detail, logged };
}

// Reuse the result across StrictMode and Ticket hash navigation, scoped to the logged-in user.
export function getLarkAppChatContext(apiBaseUrl, userId) {
  const href = window.location.href;
  const key = JSON.stringify([apiBaseUrl, userId, href.split("#")[0]]);
  if (!pendingContexts.has(key)) pendingContexts.set(key, collectLarkChatContext({ apiBaseUrl, href, userAgent: navigator.userAgent, actionRunId: crypto.randomUUID() }));
  return pendingContexts.get(key);
}
