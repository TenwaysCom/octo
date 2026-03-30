import { describe, expect, it, vi } from "vitest";
import {
  buildMeegleAuthRequest,
  createMeegleAuthController,
  resolveMeegleStatusDisplay,
} from "./meegle-auth.js";

describe("popup meegle auth", () => {
  it("builds the auth request with the canonical auth base", () => {
    expect(
      buildMeegleAuthRequest({
        currentTabId: 42,
        currentTabOrigin: "https://meegle.com",
        authBaseUrl: "https://project.larksuite.com",
        currentPageType: "meegle",
        larkId: "ou_xxx",
        meegleUserKey: undefined,
      }),
    ).toMatchObject({
      currentTabId: 42,
      baseUrl: "https://project.larksuite.com",
      pageOrigin: "https://meegle.com",
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

  it("reuses an already-ready server status before asking background to exchange again", async () => {
    const sendMessage = vi.fn();
    const setStatus = vi.fn();
    const log = {
      add: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const controller = createMeegleAuthController({
      getExistingStatus: vi.fn().mockResolvedValue({
        status: "ready",
        baseUrl: "https://project.larksuite.com",
        credentialStatus: "active",
        expiresAt: "2026-03-27T09:30:00.000Z",
      }),
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

    expect(sendMessage).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(
      "ready",
      expect.stringContaining("已授权"),
    );
    expect(log.success).toHaveBeenCalledWith(
      expect.stringContaining("沿用服务端"),
    );
  });

  it("formats a ready status with credential detail and expiry", () => {
    expect(
      resolveMeegleStatusDisplay(
        {
          status: "ready",
          credentialStatus: "active",
          expiresAt: "2026-03-27T09:30:00.000Z",
        },
        "7538275242901291040",
      ),
    ).toMatchObject({
      status: "ready",
      text: expect.stringContaining("已授权"),
    });
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

  it("shows the server exchange error when token exchange fails", async () => {
    const log = {
      add: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const controller = createMeegleAuthController({
      sendMessage: vi.fn().mockResolvedValue({
        status: "failed",
        reason: "MEEGLE_AUTH_CODE_EXCHANGE_FAILED",
        errorMessage: "auth code expired or already used",
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
      expect.stringContaining("auth code expired or already used"),
    );
  });

  it("falls back to the exchange reason when the detailed error message is missing", async () => {
    const log = {
      add: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const controller = createMeegleAuthController({
      sendMessage: vi.fn().mockResolvedValue({
        status: "failed",
        reason: "MEEGLE_AUTH_CODE_EXCHANGE_FAILED",
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
      expect.stringContaining("MEEGLE_AUTH_CODE_EXCHANGE_FAILED"),
    );
  });

  it("shows the detailed exchange message even when the server originally returned INTERNAL_ERROR", async () => {
    const log = {
      add: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const controller = createMeegleAuthController({
      sendMessage: vi.fn().mockResolvedValue({
        status: "failed",
        reason: "MEEGLE_AUTH_CODE_EXCHANGE_FAILED",
        errorMessage: "Missing token field: plugin_access_token, token, access_token",
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
      expect.stringContaining("Missing token field"),
    );
  });
});
