import { describe, expect, it, vi } from "vitest";
import {
  buildMeegleAuthRequest,
  createMeegleAuthController,
} from "./meegle-auth.js";

describe("popup meegle auth", () => {
  it("builds the auth request from the current tab", () => {
    expect(
      buildMeegleAuthRequest({
        currentTabId: 42,
        currentTabOrigin: "https://tenant.meegle.com",
        currentPageType: "meegle",
        larkId: "ou_xxx",
        meegleUserKey: undefined,
      }),
    ).toMatchObject({
      currentTabId: 42,
      baseUrl: "https://tenant.meegle.com",
      currentPageIsMeegle: true,
      operatorLarkId: "ou_xxx",
    });
  });

  it("does not perform a second exchange when background already returns ready", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      status: "ready",
      authCode: "auth_code_123",
    });
    const setStatus = vi.fn();
    const log = {
      add: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const controller = createMeegleAuthController({
      sendMessage,
      setStatus,
      log,
    });

    await expect(
      controller.run({
        currentTabId: 42,
        currentTabOrigin: "https://tenant.meegle.com",
        currentPageType: "meegle",
        larkId: "ou_xxx",
      }),
    ).resolves.toBe(true);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalled();
  });

  it("shows a clear message when auth is triggered from a non-Meegle page", async () => {
    const log = {
      add: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const controller = createMeegleAuthController({
      sendMessage: vi.fn().mockResolvedValue({
        status: "failed",
        reason: "MEEGLE_PAGE_REQUIRED",
      }),
      setStatus: vi.fn(),
      log,
    });

    await expect(
      controller.run({
        currentTabId: 7,
        currentTabOrigin: "https://www.larksuite.com",
        currentPageType: "lark",
        larkId: "ou_xxx",
      }),
    ).resolves.toBe(false);

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Meegle"),
    );
  });

  it("tells the user to configure the plugin ID when it is missing", async () => {
    const log = {
      add: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const controller = createMeegleAuthController({
      sendMessage: vi.fn().mockResolvedValue({
        status: "failed",
        reason: "PLUGIN_ID_NOT_CONFIGURED",
      }),
      setStatus: vi.fn(),
      log,
    });

    await expect(
      controller.run({
        currentTabId: 42,
        currentTabOrigin: "https://tenant.meegle.com",
        currentPageType: "meegle",
        larkId: "ou_xxx",
      }),
    ).resolves.toBe(false);

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("MEEGLE_PLUGIN_ID"),
    );
  });

  it("explains when only the auth code was acquired but the server token is not ready", async () => {
    const log = {
      add: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const controller = createMeegleAuthController({
      sendMessage: vi.fn().mockResolvedValue({
        status: "failed",
        reason: "MEEGLE_USER_KEY_REQUIRED",
        authCode: "auth_code_123",
        credentialStatus: "auth_code_received",
      }),
      setStatus: vi.fn(),
      log,
    });

    await expect(
      controller.run({
        currentTabId: 42,
        currentTabOrigin: "https://tenant.meegle.com",
        currentPageType: "meegle",
        larkId: "ou_xxx",
      }),
    ).resolves.toBe(false);

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("auth code"),
    );
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("服务端"),
    );
  });
});
