import { describe, expect, it } from "vitest";
import { installOctoWebPresenceBridge, OCTO_EXTENSION_PRESENCE_PROBE_EVENT, OCTO_EXTENSION_PRESENCE_READY_EVENT, OCTO_PLUGIN_LOGIN_PROBE_EVENT, OCTO_PLUGIN_LOGIN_READY_EVENT } from "./web-presence-bridge.js";

describe("installOctoWebPresenceBridge", () => {
  it("returns only the nonce and extension version", () => {
    const windowRef = new EventTarget() as unknown as Window;
    const received: Array<{ nonce: string; version: string }> = [];
    const originalCustomEvent = globalThis.CustomEvent;

    if (!globalThis.CustomEvent) {
      Object.defineProperty(globalThis, "CustomEvent", {
        configurable: true,
        value: class extends Event {
          detail: unknown;

          constructor(type: string, init: CustomEventInit) {
            super(type);
            this.detail = init.detail;
          }
        },
      });
    }

    windowRef.addEventListener(OCTO_EXTENSION_PRESENCE_READY_EVENT, ((event: CustomEvent) => {
      received.push(event.detail);
    }) as EventListener);
    const remove = installOctoWebPresenceBridge({ windowRef, version: "0.8.2" });

    windowRef.dispatchEvent(new CustomEvent(OCTO_EXTENSION_PRESENCE_PROBE_EVENT, {
      detail: { nonce: "probe_nonce", ignored: "not-returned" },
    }));

    expect(received).toEqual([{ nonce: "probe_nonce", version: "0.8.2" }]);
    remove();
    if (!originalCustomEvent) {
      delete (globalThis as { CustomEvent?: typeof CustomEvent }).CustomEvent;
    }
  });

  it("returns only the nonce and plugin-login result", async () => {
    const windowRef = new EventTarget() as unknown as Window;
    const received: Array<{ nonce: string; status: string; errorCode?: string }> = [];
    const originalCustomEvent = globalThis.CustomEvent;
    if (!globalThis.CustomEvent) {
      Object.defineProperty(globalThis, "CustomEvent", {
        configurable: true,
        value: class extends Event {
          detail: unknown;
          constructor(type: string, init: CustomEventInit) {
            super(type);
            this.detail = init.detail;
          }
        },
      });
    }

    windowRef.addEventListener(OCTO_PLUGIN_LOGIN_READY_EVENT, ((event: CustomEvent) => {
      received.push(event.detail);
    }) as EventListener);
    const remove = installOctoWebPresenceBridge({
      windowRef,
      version: "0.8.2",
      approvePluginLogin: async () => ({ status: "approved" }),
    });
    windowRef.dispatchEvent(new CustomEvent(OCTO_PLUGIN_LOGIN_PROBE_EVENT, {
      detail: { nonce: "probe_nonce", challengeId: "challenge_123", ignored: "not-returned" },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(received).toEqual([{ nonce: "probe_nonce", status: "approved" }]);
    remove();
    if (!originalCustomEvent) {
      delete (globalThis as { CustomEvent?: typeof CustomEvent }).CustomEvent;
    }
  });
});
