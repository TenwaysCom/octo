export const EXTENSION_PRESENCE_PROBE_EVENT = "tenways-octo:extension-presence-probe";
export const EXTENSION_PRESENCE_READY_EVENT = "tenways-octo:extension-presence-ready";
export const EXTENSION_PLUGIN_LOGIN_PROBE_EVENT = "tenways-octo:plugin-login-probe";
export const EXTENSION_PLUGIN_LOGIN_READY_EVENT = "tenways-octo:plugin-login-ready";

function createNonce() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createEvent(windowRef, type, detail) {
  if (typeof windowRef.CustomEvent === "function") {
    return new windowRef.CustomEvent(type, { detail });
  }

  return { type, detail };
}

export function detectOctoExtension({
  windowRef = window,
  timeoutMs = 500,
} = {}) {
  return new Promise((resolve) => {
    if (!windowRef?.addEventListener || !windowRef?.dispatchEvent) {
      resolve({ detected: false });
      return;
    }

    const nonce = createNonce();
    let timeoutId;
    const finish = (result) => {
      windowRef.removeEventListener(EXTENSION_PRESENCE_READY_EVENT, onReady);
      if (timeoutId !== undefined) {
        windowRef.clearTimeout(timeoutId);
      }
      resolve(result);
    };
    const onReady = (event) => {
      const detail = event?.detail;
      if (!detail || detail.nonce !== nonce || typeof detail.version !== "string") {
        return;
      }
      finish({ detected: true, version: detail.version });
    };

    windowRef.addEventListener(EXTENSION_PRESENCE_READY_EVENT, onReady);
    timeoutId = windowRef.setTimeout(() => finish({ detected: false }), timeoutMs);
    windowRef.dispatchEvent(createEvent(windowRef, EXTENSION_PRESENCE_PROBE_EVENT, { nonce }));
  });
}

export function approveOctoPluginLogin({
  challengeId,
  windowRef = window,
  timeoutMs = 5_000,
} = {}) {
  return new Promise((resolve) => {
    if (!challengeId || !windowRef?.addEventListener || !windowRef?.dispatchEvent) {
      resolve({ approved: false, errorCode: "EXTENSION_NOT_DETECTED" });
      return;
    }

    const nonce = createNonce();
    let timeoutId;
    const finish = (result) => {
      windowRef.removeEventListener(EXTENSION_PLUGIN_LOGIN_READY_EVENT, onReady);
      if (timeoutId !== undefined) {
        windowRef.clearTimeout(timeoutId);
      }
      resolve(result);
    };
    const onReady = (event) => {
      const detail = event?.detail;
      if (!detail || detail.nonce !== nonce || typeof detail.status !== "string") {
        return;
      }
      finish(detail.status === "approved"
        ? { approved: true }
        : { approved: false, errorCode: detail.errorCode || "PLUGIN_LOGIN_FAILED" });
    };

    windowRef.addEventListener(EXTENSION_PLUGIN_LOGIN_READY_EVENT, onReady);
    timeoutId = windowRef.setTimeout(
      () => finish({ approved: false, errorCode: "PLUGIN_LOGIN_TIMEOUT" }),
      timeoutMs,
    );
    windowRef.dispatchEvent(createEvent(windowRef, EXTENSION_PLUGIN_LOGIN_PROBE_EVENT, {
      nonce,
      challengeId,
    }));
  });
}
