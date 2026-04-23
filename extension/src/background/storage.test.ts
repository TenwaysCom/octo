import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearIgnoredVersion, getUpdateState, saveUpdateState } from "./storage.js";

describe("update state storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no update state is stored", async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((keys, callback) => {
      callback?.({});
    });

    await expect(getUpdateState()).resolves.toBeNull();
  });

  it("returns stored update state", async () => {
    const storedState = {
      hasUpdate: true,
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      releaseNotes: "Bug fixes",
      downloadUrl: "https://example.com/update.zip",
      forceUpdate: false,
      ignoredVersion: null,
      dismissedAt: null,
    };

    vi.mocked(chrome.storage.local.get).mockImplementation((keys, callback) => {
      callback?.({ itpm_update_state: storedState });
    });

    await expect(getUpdateState()).resolves.toEqual(storedState);
  });

  it("saves update state to storage", async () => {
    const setMock = vi.fn((_data, callback) => {
      callback?.();
    }) as unknown as typeof chrome.storage.local.set;
    chrome.storage.local.set = setMock;

    const state = {
      hasUpdate: true,
      currentVersion: "1.0.0",
      latestVersion: "1.2.0",
      releaseNotes: "New features",
      downloadUrl: "https://example.com/update.zip",
      forceUpdate: true,
      ignoredVersion: "1.1.0",
      dismissedAt: "2026-04-22T10:00:00Z",
    };

    await saveUpdateState(state);

    expect(setMock).toHaveBeenCalledWith(
      { itpm_update_state: state },
      expect.any(Function),
    );
  });

  it("clears ignored version and dismissed timestamp", async () => {
    const storedState = {
      hasUpdate: true,
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      releaseNotes: "Bug fixes",
      downloadUrl: "https://example.com/update.zip",
      forceUpdate: false,
      ignoredVersion: "1.1.0",
      dismissedAt: "2026-04-22T10:00:00Z",
    };

    const getMock = vi.fn();
    const setMock = vi.fn((_data, callback) => {
      callback?.();
    }) as unknown as typeof chrome.storage.local.set;
    chrome.storage.local.get = getMock;
    chrome.storage.local.set = setMock;

    getMock.mockImplementation((keys, callback) => {
      callback?.({ itpm_update_state: storedState });
    });

    await clearIgnoredVersion();

    expect(setMock).toHaveBeenCalledWith(
      {
        itpm_update_state: {
          ...storedState,
          ignoredVersion: null,
          dismissedAt: null,
        },
      },
      expect.any(Function),
    );
  });

  it("does nothing when clearing ignored version if no state exists", async () => {
    const getMock = vi.fn();
    const setMock = vi.fn();
    chrome.storage.local.get = getMock;
    chrome.storage.local.set = setMock;

    getMock.mockImplementation((keys, callback) => {
      callback?.({});
    });

    await clearIgnoredVersion();

    expect(setMock).not.toHaveBeenCalled();
  });
});
