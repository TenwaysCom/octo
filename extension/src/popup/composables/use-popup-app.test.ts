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
    popup.openSettings();
    popup.settingsForm.SERVER_URL = "http://changed.local";

    popup.closeSettings();

    expect(popup.activePage.value).toBe("home");
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
});
