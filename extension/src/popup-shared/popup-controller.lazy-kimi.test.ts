// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({
  clearResolvedIdentity: vi.fn(),
  clearResolvedIdentityForTab: vi.fn(),
  fetchLarkUserInfo: vi.fn(),
  getConfig: vi.fn(),
  getLarkAuthStatus: vi.fn(),
  loadPopupSettings: vi.fn(),
  loadResolvedIdentity: vi.fn(),
  postClientDebugLog: vi.fn(),
  queryActiveTabContext: vi.fn(),
  requestLarkUserId: vi.fn(),
  requestMeegleUserIdentity: vi.fn(),
  resolveIdentityRequest: vi.fn(),
  runLarkAuthRequest: vi.fn(),
  runLarkBaseBulkCreateRequest: vi.fn(),
  runLarkBaseBulkPreviewRequest: vi.fn(),
  runMeegleAuthRequest: vi.fn(),
  runMeegleLarkPushRequest: vi.fn(),
  savePopupSettings: vi.fn(),
  saveResolvedIdentity: vi.fn(),
  saveResolvedIdentityForTab: vi.fn(),
  watchLarkAuthCallbackResult: vi.fn(() => () => {}),
}));

const meegleAuthControllerMock = vi.hoisted(() => ({
  getLastAuth: vi.fn(),
  run: vi.fn(),
}));

const kimiChatControllerMock = vi.hoisted(() => ({
  resetSession: vi.fn(),
  openHistory: vi.fn(async () => undefined),
  loadHistorySession: vi.fn(async (_sessionId: string) => undefined),
  deleteHistorySession: vi.fn(async (_sessionId: string) => undefined),
  sendMessage: vi.fn(async (_message: string) => undefined),
  stopGeneration: vi.fn(),
  dispose: vi.fn(),
}));

const kimiChatModuleMock = vi.hoisted(() => ({
  createKimiChatController: vi.fn(() => kimiChatControllerMock),
}));

vi.mock("../popup/runtime.js", () => runtimeMock);

vi.mock("../popup/meegle-auth.js", async () => {
  const actual = await vi.importActual<typeof import("../popup/meegle-auth.js")>(
    "../popup/meegle-auth.js",
  );

  return {
    ...actual,
    createMeegleAuthController: vi.fn(() => meegleAuthControllerMock),
  };
});

vi.mock("./popup-kimi-chat-controller.js", () => kimiChatModuleMock);

import { createPopupController } from "./popup-controller";

describe("popup controller Kimi lazy loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    runtimeMock.getConfig.mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_APP_ID: "cli_test",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
    });
    runtimeMock.loadPopupSettings.mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
      meegleUserKey: "7538275242901291040",
      larkUserId: "ou_user",
    });
    runtimeMock.loadResolvedIdentity.mockResolvedValue(undefined);
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://project.larksuite.com/wiki/test",
      origin: "https://project.larksuite.com",
      pageType: "lark",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue("ou_user");
    runtimeMock.requestMeegleUserIdentity.mockResolvedValue(undefined);
    runtimeMock.resolveIdentityRequest.mockResolvedValue({
      ok: true,
      data: {
        masterUserId: "usr_resolved",
        identityStatus: "active",
        operatorLarkId: "ou_resolved",
        larkEmail: "user@example.com",
      },
    });
    runtimeMock.getLarkAuthStatus.mockResolvedValue({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
      masterUserId: "usr_resolved",
      expiresAt: "2026-04-02T21:01:00.000Z",
    });
    runtimeMock.fetchLarkUserInfo.mockResolvedValue({
      ok: true,
      data: {
        userId: "ou_user",
        tenantKey: "tenant_123",
        email: "user@example.com",
        name: "Test User",
        avatarUrl: "https://example.com/avatar.png",
      },
    });
    runtimeMock.postClientDebugLog.mockResolvedValue(true);
    runtimeMock.runMeegleAuthRequest.mockResolvedValue({
      status: "ready",
      baseUrl: "https://project.larksuite.com",
      credentialStatus: "active",
    });
    runtimeMock.saveResolvedIdentity.mockResolvedValue(undefined);
    runtimeMock.saveResolvedIdentityForTab.mockResolvedValue(undefined);
    runtimeMock.savePopupSettings.mockResolvedValue(undefined);

    meegleAuthControllerMock.run.mockResolvedValue(true);
    meegleAuthControllerMock.getLastAuth.mockReturnValue(undefined);

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "ready",
          baseUrl: "https://project.larksuite.com",
          credentialStatus: "active",
        },
      }),
    } as Response);
  });

  it("does not preload the Kimi module for ordinary chat navigation", async () => {
    const controller = createPopupController();

    await controller.initialize();

    controller.setActivePage("chat");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(controller.getState().activePage).toBe("chat");
    expect(controller.getState().showKimiChat).toBe(false);
    expect(kimiChatModuleMock.createKimiChatController).not.toHaveBeenCalled();

    controller.openSettings();
    controller.closeSettings();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(controller.getState().activePage).toBe("chat");
    expect(kimiChatModuleMock.createKimiChatController).not.toHaveBeenCalled();
  });

  it("keeps the shared controller as the entrypoint and instantiates the Kimi module on demand", async () => {
    const controller = createPopupController();

    expect(kimiChatModuleMock.createKimiChatController).not.toHaveBeenCalled();

    await controller.initialize();

    expect(kimiChatModuleMock.createKimiChatController).not.toHaveBeenCalled();

    void controller.runFeatureAction("analyze");

    await vi.waitFor(() => {
      expect(kimiChatModuleMock.createKimiChatController).toHaveBeenCalledTimes(1);
    });

    expect(controller.getState().activePage).toBe("chat");
    expect(controller.getState().showKimiChat).toBe(true);
    expect(kimiChatControllerMock.resetSession).not.toHaveBeenCalled();

    await controller.openKimiChatHistory();

    expect(kimiChatControllerMock.openHistory).toHaveBeenCalledTimes(1);

    controller.dispose();

    expect(kimiChatControllerMock.dispose).toHaveBeenCalledTimes(1);
  });
});
