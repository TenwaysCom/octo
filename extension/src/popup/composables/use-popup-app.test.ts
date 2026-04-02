// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getLarkAuthStatus: vi.fn(),
  loadPopupSettings: vi.fn(),
  loadResolvedIdentity: vi.fn(),
  queryActiveTabContext: vi.fn(),
  requestLarkUserId: vi.fn(),
  requestMeegleUserIdentity: vi.fn(),
  resolveIdentityRequest: vi.fn(),
  runLarkAuthRequest: vi.fn(),
  runMeegleAuthRequest: vi.fn(),
  watchLarkAuthCallbackResult: vi.fn(),
  saveResolvedIdentity: vi.fn(),
  savePopupSettings: vi.fn(),
}));

const meegleAuthControllerMock = vi.hoisted(() => ({
  run: vi.fn(),
  getLastAuth: vi.fn(),
}));

vi.mock("../runtime.js", () => runtimeMock);

vi.mock("../meegle-auth.js", async () => {
  const actual = await vi.importActual<typeof import("../meegle-auth.js")>(
    "../meegle-auth.js",
  );

  return {
    ...actual,
    createMeegleAuthController: vi.fn(() => meegleAuthControllerMock),
  };
});

import { usePopupApp } from "./use-popup-app";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("usePopupApp notebook state", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    runtimeMock.getConfig.mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_APP_ID: "cli_test",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
    });
    runtimeMock.getLarkAuthStatus.mockResolvedValue({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
    });
    runtimeMock.loadPopupSettings.mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
      meegleUserKey: "7538275242901291040",
      larkUserId: "ou_user",
    });
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://project.larksuite.com/wiki/test",
      origin: "https://project.larksuite.com",
      pageType: "lark",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue("ou_user");
    runtimeMock.requestMeegleUserIdentity.mockResolvedValue(undefined);
    runtimeMock.loadResolvedIdentity.mockResolvedValue(undefined);
    runtimeMock.resolveIdentityRequest.mockResolvedValue({
      ok: true,
      data: {
        masterUserId: "usr_resolved",
        identityStatus: "active",
      },
    });
    runtimeMock.runLarkAuthRequest.mockResolvedValue({
      status: "in_progress",
      baseUrl: "https://open.larksuite.com",
      state: "state_123",
    });
    runtimeMock.runMeegleAuthRequest.mockResolvedValue({
      status: "ready",
      baseUrl: "https://project.larksuite.com",
      credentialStatus: "active",
    });
    runtimeMock.saveResolvedIdentity.mockResolvedValue(undefined);
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

  it("does not auto-start lark oauth during initialization", async () => {
    const popup = usePopupApp();

    await popup.initialize();

    expect(runtimeMock.getLarkAuthStatus).toHaveBeenCalledTimes(1);
    expect(runtimeMock.runLarkAuthRequest).not.toHaveBeenCalled();
  });

  it("starts lark oauth only after the user clicks authorize", async () => {
    runtimeMock.getLarkAuthStatus
      .mockResolvedValueOnce({
        status: "require_auth",
        baseUrl: "https://open.larksuite.com",
        reason: "No stored Lark token found",
      })
      .mockResolvedValueOnce({
        status: "require_auth",
        baseUrl: "https://open.larksuite.com",
        reason: "No stored Lark token found",
      });

    const popup = usePopupApp();

    await popup.initialize();
    await popup.authorizeLark();

    expect(runtimeMock.runLarkAuthRequest).toHaveBeenCalledTimes(1);
    expect(
      popup.logs.value.some((entry) => entry.message.includes("已打开 Lark 授权页")),
    ).toBe(true);
  });

  it("switches to settings and restores the saved snapshot on cancel", async () => {
    const popup = usePopupApp();

    await popup.initialize();
    expect(popup.headerSubtitle.value).toBe("Lark");
    popup.openSettings();
    expect(popup.headerSubtitle.value).toBe("Settings");
    popup.settingsForm.SERVER_URL = "http://changed.local";

    popup.closeSettings();

    expect(popup.activePage.value).toBe("home");
    expect(popup.headerSubtitle.value).toBe("Lark");
    expect(popup.settingsForm.SERVER_URL).toBe("http://localhost:3000");
  });

  it("returns to home after save and refreshes auth state", async () => {
    const popup = usePopupApp();

    await popup.initialize();
    popup.openSettings();
    popup.settingsForm.SERVER_URL = "http://saved.local";

    await popup.saveSettingsForm();

    expect(runtimeMock.savePopupSettings).toHaveBeenCalledWith({
      SERVER_URL: "http://saved.local",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
      meegleUserKey: "7538275242901291040",
      larkUserId: "ou_user",
    });
    expect(popup.activePage.value).toBe("home");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(runtimeMock.getLarkAuthStatus).toHaveBeenCalledTimes(2);
  });

  it("reloads the latest server callback url from settings", async () => {
    runtimeMock.loadPopupSettings
      .mockResolvedValueOnce({
        SERVER_URL: "http://localhost:3000",
        MEEGLE_PLUGIN_ID: "MII_PLUGIN",
        LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
        meegleUserKey: "7538275242901291040",
        larkUserId: "ou_user",
      })
      .mockResolvedValueOnce({
        SERVER_URL: "http://localhost:3000",
        MEEGLE_PLUGIN_ID: "MII_PLUGIN",
        LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
        meegleUserKey: "7538275242901291040",
        larkUserId: "ou_user",
      })
      .mockResolvedValueOnce({
        SERVER_URL: "http://localhost:3000",
        MEEGLE_PLUGIN_ID: "MII_PLUGIN",
        LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
        meegleUserKey: "7538275242901291040",
        larkUserId: "ou_user",
      });

    const popup = usePopupApp();

    await popup.initialize();
    popup.openSettings();
    await popup.refreshServerConfig();

    expect(popup.settingsForm.LARK_OAUTH_CALLBACK_URL).toBe(
      "https://example.ngrok-free.app/api/lark/auth/callback",
    );
    expect(
      popup.logs.value.some((entry) => entry.message.includes("已刷新服务端配置")),
    ).toBe(true);
  });

  it("shows the resolved platform while auth checks are still loading", async () => {
    const meegleStatusRequest = createDeferred<Response>();
    vi.mocked(globalThis.fetch).mockReturnValue(meegleStatusRequest.promise);

    const popup = usePopupApp();
    const initializePromise = popup.initialize();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(popup.state.pageType).toBe("lark");
    expect(popup.headerSubtitle.value).toBe("Lark");

    meegleStatusRequest.resolve({
      ok: true,
      json: async () => ({
        data: {
          status: "ready",
          baseUrl: "https://project.larksuite.com",
          credentialStatus: "active",
        },
      }),
    } as Response);

    await initializePromise;
  });

  it("updates meegle auth state before lark auth finishes", async () => {
    const larkAuthRequest = createDeferred<{
      status: "ready";
      baseUrl: string;
    }>();
    runtimeMock.getLarkAuthStatus.mockReturnValueOnce(larkAuthRequest.promise);

    const popup = usePopupApp();
    const initializePromise = popup.initialize();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(popup.topMeegleButtonText.value).toBe("授权");
    await vi.waitFor(() => {
      expect(popup.state.meegleAuth?.status).toBe("ready");
      expect(popup.state.isAuthed.meegle).toBe(true);
      expect(popup.topMeegleButtonText.value).toBe("已授权");
      expect(popup.meegleStatus.value.text).toContain("已授权");
    });

    larkAuthRequest.resolve({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
    });

    await initializePromise;
  });

  it("clears the scanning state when initialization fails", async () => {
    runtimeMock.getLarkAuthStatus.mockRejectedValueOnce(
      new Error("background offline"),
    );

    const popup = usePopupApp();

    await popup.initialize();

    expect(popup.isLoading.value).toBe(false);
    expect(popup.headerSubtitle.value).toBe("Lark");
    expect(
      popup.logs.value.some((entry) => entry.message.includes("background offline")),
    ).toBe(true);
  });

  it("refreshes Lark auth and logs success when callback completion arrives", async () => {
    let callbackListener:
      | ((result: {
          state: string;
          status: "ready" | "failed";
          masterUserId?: string;
          reason?: string;
        }) => void)
      | undefined;
    runtimeMock.watchLarkAuthCallbackResult.mockImplementation((listener) => {
      callbackListener = listener;
      return () => {};
    });

    const popup = usePopupApp();
    await popup.initialize();
    runtimeMock.saveResolvedIdentity.mockClear();

    runtimeMock.getLarkAuthStatus.mockResolvedValueOnce({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
    });

    await callbackListener?.({
      state: "state_123",
      status: "ready",
      masterUserId: "usr_callback",
    });

    expect(runtimeMock.saveResolvedIdentity).toHaveBeenCalledWith("usr_callback");
    expect(popup.state.identity.masterUserId).toBe("usr_callback");
    expect(runtimeMock.getLarkAuthStatus).toHaveBeenCalledTimes(2);
    expect(
      popup.logs.value.some((entry) => entry.message.includes("Lark 授权完成")),
    ).toBe(true);
  });

  it("resolves and caches masterUserId during initialization", async () => {
    const popup = usePopupApp();

    await popup.initialize();

    expect(runtimeMock.resolveIdentityRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorLarkId: "ou_user",
        meegleUserKey: "7538275242901291040",
      }),
    );
    expect(runtimeMock.saveResolvedIdentity).toHaveBeenCalledWith(
      "usr_resolved",
    );
    expect(popup.state.identity.masterUserId).toBe("usr_resolved");
  });

  it("resolves masterUserId before running meegle auth", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://project.larksuite.com/wiki/test",
      origin: "https://project.larksuite.com",
      pageType: "meegle",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue(undefined);
    runtimeMock.requestMeegleUserIdentity.mockResolvedValue({
      userKey: "user_from_page",
    });

    const popup = usePopupApp();
    await popup.initialize();

    meegleAuthControllerMock.run.mockClear();
    runtimeMock.resolveIdentityRequest.mockClear();

    await popup.authorizeMeegle();

    expect(runtimeMock.resolveIdentityRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        meegleUserKey: "user_from_page",
      }),
    );
    expect(meegleAuthControllerMock.run).toHaveBeenCalledWith(
      expect.objectContaining({
        masterUserId: "usr_resolved",
        meegleUserKey: "user_from_page",
      }),
    );
  });

  it("fills the settings form from the current meegle page when requested manually", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://project.larksuite.com/4c3fv6/overview",
      origin: "https://project.larksuite.com",
      pageType: "meegle",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue(undefined);
    runtimeMock.requestMeegleUserIdentity
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        userKey: "user_from_cookie",
      });

    const popup = usePopupApp();
    await popup.initialize();

    popup.openSettings();
    popup.settingsForm.meegleUserKey = "";

    await popup.fetchMeegleUserKey();

    expect(runtimeMock.requestMeegleUserIdentity).toHaveBeenLastCalledWith(
      12,
      "https://project.larksuite.com/4c3fv6/overview",
    );
    expect(popup.settingsForm.meegleUserKey).toBe("user_from_cookie");
    expect(popup.state.identity.meegleUserKey).toBe("user_from_cookie");
    expect(
      popup.logs.value.some((entry) => entry.message.includes("已获取 Meegle User Key")),
    ).toBe(true);
  });

  it("blocks meegle auth when resolve reports an identity conflict", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://project.larksuite.com/wiki/test",
      origin: "https://project.larksuite.com",
      pageType: "meegle",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue(undefined);
    runtimeMock.requestMeegleUserIdentity.mockResolvedValue({
      userKey: "user_from_page",
    });

    const popup = usePopupApp();
    await popup.initialize();

    meegleAuthControllerMock.run.mockClear();
    runtimeMock.resolveIdentityRequest.mockClear();
    runtimeMock.resolveIdentityRequest.mockResolvedValue({
      ok: true,
      data: {
        masterUserId: "usr_conflict",
        identityStatus: "conflict",
      },
    });

    await popup.authorizeMeegle();

    expect(meegleAuthControllerMock.run).not.toHaveBeenCalled();
    expect(popup.state.identity.masterUserId).toBeNull();
    expect(popup.logs.value.some((entry) => entry.message.includes("账号冲突"))).toBe(true);
  });
});
