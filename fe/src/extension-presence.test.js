import assert from "node:assert/strict";
import test from "node:test";
import {
  detectOctoExtension,
  EXTENSION_PRESENCE_PROBE_EVENT,
  EXTENSION_PRESENCE_READY_EVENT,
  approveOctoPluginLogin,
  EXTENSION_PLUGIN_LOGIN_PROBE_EVENT,
  EXTENSION_PLUGIN_LOGIN_READY_EVENT,
  OCTO_WEB_BRIDGE_PROTOCOL_VERSION,
} from "./extension-presence.js";

function createWindowRef({ respond } = {}) {
  const listeners = new Map();
  return {
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatchEvent(event) {
      if (event.type === EXTENSION_PRESENCE_PROBE_EVENT && respond) {
        listeners.get(EXTENSION_PRESENCE_READY_EVENT)?.({
          detail: {
            nonce: event.detail.nonce,
            version: "0.8.2",
            protocolVersion: OCTO_WEB_BRIDGE_PROTOCOL_VERSION,
          },
        });
      }
      if (event.type === EXTENSION_PLUGIN_LOGIN_PROBE_EVENT && respond) {
        listeners.get(EXTENSION_PLUGIN_LOGIN_READY_EVENT)?.({
          detail: {
            nonce: event.detail.nonce,
            status: "approved",
            protocolVersion: OCTO_WEB_BRIDGE_PROTOCOL_VERSION,
          },
        });
      }
    },
    setTimeout(callback) {
      return setTimeout(callback, 0);
    },
    clearTimeout(timeoutId) {
      clearTimeout(timeoutId);
    },
  };
}

test("detects only a matching extension presence response", async () => {
  await assert.doesNotReject(async () => {
    const result = await detectOctoExtension({ windowRef: createWindowRef({ respond: true }) });
    assert.deepEqual(result, { detected: true, version: "0.8.2" });
  });
});

test("reports missing when no extension responds", async () => {
  const result = await detectOctoExtension({ windowRef: createWindowRef(), timeoutMs: 0 });
  assert.deepEqual(result, { detected: false });
});

test("ignores an older extension response without the current bridge protocol", async () => {
  const listeners = new Map();
  const windowRef = {
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatchEvent(event) {
      if (event.type === EXTENSION_PRESENCE_PROBE_EVENT) {
        listeners.get(EXTENSION_PRESENCE_READY_EVENT)?.({
          detail: { nonce: event.detail.nonce, version: "0.9.0" },
        });
      }
    },
    setTimeout,
    clearTimeout,
  };

  const result = await detectOctoExtension({ windowRef, timeoutMs: 0 });
  assert.deepEqual(result, { detected: false });
});

test("approves plugin login with only the one-time challenge and nonce", async () => {
  const result = await approveOctoPluginLogin({
    challengeId: "challenge_123",
    windowRef: createWindowRef({ respond: true }),
  });
  assert.deepEqual(result, { approved: true });
});

test("prefers a later approval when an older extension reports a failure first", async () => {
  const listeners = new Map();
  const windowRef = {
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatchEvent(event) {
      if (event.type !== EXTENSION_PLUGIN_LOGIN_PROBE_EVENT) {
        return;
      }
      const listener = listeners.get(EXTENSION_PLUGIN_LOGIN_READY_EVENT);
      listener?.({
        detail: {
          nonce: event.detail.nonce,
          status: "failed",
          errorCode: "ENVIRONMENT_MISMATCH",
        },
      });
      setTimeout(() => listener?.({
        detail: {
          nonce: event.detail.nonce,
          status: "approved",
          protocolVersion: OCTO_WEB_BRIDGE_PROTOCOL_VERSION,
        },
      }), 0);
    },
    setTimeout,
    clearTimeout,
  };

  const result = await approveOctoPluginLogin({
    challengeId: "challenge_123",
    windowRef,
    failureGraceMs: 10,
  });
  assert.deepEqual(result, { approved: true });
});
