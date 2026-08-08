import assert from "node:assert/strict";
import test from "node:test";
import {
  detectOctoExtension,
  EXTENSION_PRESENCE_PROBE_EVENT,
  EXTENSION_PRESENCE_READY_EVENT,
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
          detail: { nonce: event.detail.nonce, version: "0.8.2" },
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
