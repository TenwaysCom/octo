// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({
  getConfig: vi.fn(),
  loadPopupSettings: vi.fn(),
  queryActiveTabContext: vi.fn(),
  requestLarkUserId: vi.fn(),
  requestMeegleUserIdentity: vi.fn(),
  runLarkAuthRequest: vi.fn(),
  runMeegleAuthRequest: vi.fn(),
  savePopupSettings: vi.fn(),
}));

const meegleAuthControllerMock = vi.hoisted(() => ({
  run: vi.fn(),
  getLastAuth: vi.fn(),
}));

vi.mock("../runtime.js", () => runtimeMock);

vi.mock("../meegle-auth.js", () => ({
  createMeegleAuthController: vi.fn(() => meegleAuthControllerMock),
}));

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
    });
    runtimeMock.loadPopupSettings.mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
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
    runtimeMock.runLarkAuthRequest.mockResolvedValue({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
      tokenStatus: "ready",
    });
    runtimeMock.runMeegleAuthRequest.mockResolvedValue({
      status: "ready",
      baseUrl: "https://project.larksuite.com",
      credentialStatus: "active",
    });
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
      meegleUserKey: "7538275242901291040",
      larkUserId: "ou_user",
    });
    expect(popup.activePage.value).toBe("home");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(runtimeMock.runLarkAuthRequest).toHaveBeenCalledTimes(2);
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

  it("applies the Meegle ready state before the Lark auth check finishes", async () => {
    const meegleStatusRequest = createDeferred<Response>();
    const larkStatusRequest = createDeferred<{
      status: string;
      baseUrl: string;
      tokenStatus?: string;
    }>();
    vi.mocked(globalThis.fetch).mockReturnValue(meegleStatusRequest.promise);
    runtimeMock.runLarkAuthRequest.mockReturnValue(larkStatusRequest.promise);

    const popup = usePopupApp();
    const initializePromise = popup.initialize();

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(runtimeMock.runLarkAuthRequest).toHaveBeenCalledTimes(1);
    });

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

    await vi.waitFor(() => {
      expect(popup.meegleStatus.value.text).toBe("已授权");
    });
    expect(popup.topMeegleButtonDisabled.value).toBe(true);

    larkStatusRequest.resolve({
      status: "failed",
      baseUrl: "https://open.larksuite.com",
      tokenStatus: "missing",
    });

    await initializePromise;
  });

  it("uses the canonical Meegle auth base when the current tab is meegle.com", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://meegle.com/work_item/123",
      origin: "https://meegle.com",
      pageType: "meegle",
      authBaseUrl: "https://project.larksuite.com",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue(undefined);
    runtimeMock.requestMeegleUserIdentity.mockResolvedValue({
      userKey: "7538275242901291040",
    });

    const popup = usePopupApp();

    await popup.initialize();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/meegle/auth/status",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          operatorLarkId: "ou_user",
          meegleUserKey: "7538275242901291040",
          baseUrl: "https://project.larksuite.com",
        }),
      }),
    );
  });

  it("clears the scanning state when initialization fails", async () => {
    runtimeMock.runLarkAuthRequest.mockRejectedValueOnce(
      new Error("background offline"),
    );

    const popup = usePopupApp();

    await popup.initialize();

    expect(popup.isLoading.value).toBe(false);
    expect(popup.headerSubtitle.value).toBe("Lark");
    expect(popup.logs.value[popup.logs.value.length - 1]?.message).toContain(
      "background offline",
    );
  });
});
