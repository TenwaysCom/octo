import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkForUpdate,
  clearUpdateBadge,
  compareVersions,
  downloadUpdate,
  ignoreCurrentVersion,
} from "./update-checker.js";
import { getUpdateState, saveUpdateState } from "./storage.js";

vi.mock("./storage.js", () => ({
  getUpdateState: vi.fn(),
  saveUpdateState: vi.fn(),
  getStoredMasterUserId: vi.fn(),
}));

const mockConfig = {
  SERVER_URL: "https://example.com",
} as unknown as import("./config.js").ExtensionConfig;

describe("compareVersions", () => {
  it("returns 0 when versions are equal", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("returns 1 when v1 is greater", () => {
    expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
  });

  it("returns -1 when v1 is lesser", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
    expect(compareVersions("1.9.9", "2.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
  });

  it("handles multi-digit version parts", () => {
    expect(compareVersions("1.10.0", "1.2.0")).toBe(1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("10.0.0", "9.99.99")).toBe(1);
  });

  it("handles different length versions", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0")).toBe(1);
    expect(compareVersions("1.0", "1.0.1")).toBe(-1);
  });
});

describe("checkForUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chrome.runtime.getManifest).mockReturnValue({ version: "0.6.1" } as chrome.runtime.Manifest);
  });

  it("detects a newer version and sets badge", async () => {
    const { getStoredMasterUserId } = await import("./storage.js");
    vi.mocked(getStoredMasterUserId).mockResolvedValue("usr_update");
    vi.mocked(getUpdateState).mockResolvedValue(null);
    vi.mocked(saveUpdateState).mockResolvedValue(undefined);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          version: "0.7.0",
          downloadUrl: "https://example.com/tenways-octo-0.7.0-chrome.zip",
          releaseNotes: "Bug fixes",
          forceUpdate: false,
          minVersion: "0.6.0",
        },
      }),
    } as unknown as Response);

    const result = await checkForUpdate(mockConfig);

    expect(result).toEqual({
      hasUpdate: true,
      currentVersion: "0.6.1",
      latestVersion: "0.7.0",
      versionInfo: {
        version: "0.7.0",
        downloadUrl: "https://example.com/tenways-octo-0.7.0-chrome.zip",
        releaseNotes: "Bug fixes",
        forceUpdate: false,
        minVersion: "0.6.0",
      },
    });
    expect(saveUpdateState).toHaveBeenCalledWith(
      expect.objectContaining({
        hasUpdate: true,
        currentVersion: "0.6.1",
        latestVersion: "0.7.0",
        ignoredVersion: null,
        dismissedAt: null,
      }),
    );
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "1" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#FF0000" });
    expect(chrome.notifications.create).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/api/extension/version",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "master-user-id": "usr_update",
        }),
      }),
    );
  });

  it("shows notification when forceUpdate is true", async () => {
    vi.mocked(getUpdateState).mockResolvedValue(null);
    vi.mocked(saveUpdateState).mockResolvedValue(undefined);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          version: "0.7.0",
          downloadUrl: "https://example.com/tenways-octo-0.7.0-chrome.zip",
          releaseNotes: "Critical fix",
          forceUpdate: true,
          minVersion: "0.6.0",
        },
      }),
    } as unknown as Response);

    await checkForUpdate(mockConfig);

    expect(chrome.notifications.create).toHaveBeenCalledWith({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "Tenways Octo Update Required",
      message: "A new version 0.7.0 is available. Please update to continue.",
    });
  });

  it("returns no update when current version matches latest", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          version: "0.6.1",
          downloadUrl: "https://example.com/tenways-octo-0.6.1-chrome.zip",
          releaseNotes: "Same version",
          forceUpdate: false,
          minVersion: "0.5.0",
        },
      }),
    } as unknown as Response);

    const result = await checkForUpdate(mockConfig);

    expect(result.hasUpdate).toBe(false);
    expect(saveUpdateState).not.toHaveBeenCalled();
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it("returns no update when version is ignored within 24 hours", async () => {
    const dismissedAt = new Date(Date.now() - 1000).toISOString();
    vi.mocked(getUpdateState).mockResolvedValue({
      hasUpdate: true,
      currentVersion: "0.6.1",
      latestVersion: "0.7.0",
      releaseNotes: "Bug fixes",
      downloadUrl: "https://example.com/update.zip",
      forceUpdate: false,
      ignoredVersion: "0.7.0",
      dismissedAt,
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          version: "0.7.0",
          downloadUrl: "https://example.com/update.zip",
          releaseNotes: "Bug fixes",
          forceUpdate: false,
          minVersion: "0.6.0",
        },
      }),
    } as unknown as Response);

    const result = await checkForUpdate(mockConfig);

    expect(result.hasUpdate).toBe(false);
    expect(saveUpdateState).not.toHaveBeenCalled();
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it("detects update when ignored version is older than 24 hours", async () => {
    const dismissedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    vi.mocked(getUpdateState).mockResolvedValue({
      hasUpdate: true,
      currentVersion: "0.6.1",
      latestVersion: "0.7.0",
      releaseNotes: "Bug fixes",
      downloadUrl: "https://example.com/update.zip",
      forceUpdate: false,
      ignoredVersion: "0.7.0",
      dismissedAt,
    });
    vi.mocked(saveUpdateState).mockResolvedValue(undefined);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          version: "0.7.0",
          downloadUrl: "https://example.com/update.zip",
          releaseNotes: "Bug fixes",
          forceUpdate: false,
          minVersion: "0.6.0",
        },
      }),
    } as unknown as Response);

    const result = await checkForUpdate(mockConfig);

    expect(result.hasUpdate).toBe(true);
    expect(saveUpdateState).toHaveBeenCalled();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "1" });
  });

  it("returns no update and does not throw when fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const result = await checkForUpdate(mockConfig);

    expect(result).toEqual({
      hasUpdate: false,
      currentVersion: "0.6.1",
      latestVersion: "0.6.1",
      versionInfo: null,
    });
    expect(saveUpdateState).not.toHaveBeenCalled();
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it("returns no update when server responds with ok=false", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: false }),
    } as unknown as Response);

    const result = await checkForUpdate(mockConfig);

    expect(result.hasUpdate).toBe(false);
    expect(saveUpdateState).not.toHaveBeenCalled();
  });
});

describe("downloadUpdate", () => {
  it("downloads update zip with correct filename", async () => {
    const versionInfo = {
      version: "0.7.0",
      downloadUrl: "https://example.com/tenways-octo-0.7.0-chrome.zip",
      releaseNotes: "Bug fixes",
      forceUpdate: false,
      minVersion: "0.6.0",
    };

    await downloadUpdate(versionInfo);

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      {
        url: "https://example.com/tenways-octo-0.7.0-chrome.zip",
        filename: "tenways-octo-0.7.0-update.zip",
        saveAs: false,
      },
      expect.any(Function),
    );
  });

  it("opens the extension install page after the download starts", async () => {
    const versionInfo = {
      version: "0.7.0",
      downloadUrl: "https://example.com/tenways-octo-0.7.0-chrome.zip",
      releaseNotes: "Bug fixes",
      forceUpdate: false,
      minVersion: "0.6.0",
    };

    await downloadUpdate(versionInfo);

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome://extensions/",
    });
  });
});

describe("clearUpdateBadge", () => {
  it("clears the badge text", async () => {
    await clearUpdateBadge();

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
  });
});

describe("ignoreCurrentVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chrome.runtime.getManifest).mockReturnValue({ version: "0.6.1" } as chrome.runtime.Manifest);
  });

  it("saves ignored version and clears badge", async () => {
    vi.mocked(getUpdateState).mockResolvedValue({
      hasUpdate: true,
      currentVersion: "0.6.1",
      latestVersion: "0.7.0",
      releaseNotes: "Bug fixes",
      downloadUrl: "https://example.com/update.zip",
      forceUpdate: false,
      ignoredVersion: null,
      dismissedAt: null,
    });
    vi.mocked(saveUpdateState).mockResolvedValue(undefined);

    await ignoreCurrentVersion("0.7.0");

    expect(saveUpdateState).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoredVersion: "0.7.0",
        dismissedAt: expect.any(String),
      }),
    );
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
  });

  it("works when no prior update state exists", async () => {
    vi.mocked(getUpdateState).mockResolvedValue(null);
    vi.mocked(saveUpdateState).mockResolvedValue(undefined);

    await ignoreCurrentVersion("0.7.0");

    expect(saveUpdateState).toHaveBeenCalledWith(
      expect.objectContaining({
        hasUpdate: false,
        currentVersion: "0.6.1",
        latestVersion: "0.7.0",
        ignoredVersion: "0.7.0",
        dismissedAt: expect.any(String),
      }),
    );
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
  });
});
