// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("lark auth callback content script", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
  });

  it("relays callback result from page data attributes to the background", async () => {
    document.body.innerHTML = `
      <main
        data-lark-auth-state="state_123"
        data-lark-auth-status="ready"
        data-lark-auth-master-user-id="usr_xxx"
        data-lark-auth-reason=""
      ></main>
    `;

    const sendMessage = vi.mocked(chrome.runtime.sendMessage);

    await import("./lark-auth-callback.js");

    expect(sendMessage).toHaveBeenCalledWith({
      action: "itdog.lark.auth.callback.detected",
      payload: {
        state: "state_123",
        status: "ready",
        masterUserId: "usr_xxx",
        reason: undefined,
      },
    });
  });
});
