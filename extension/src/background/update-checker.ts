import { createExtensionLogger } from "../logger.js";
import { fetchServerJson } from "../server-request.js";
import type { ExtensionVersionInfo, UpdateCheckResult, UpdateState } from "../types/update.js";
import type { ExtensionConfig } from "./config.js";
import { getStoredMasterUserId, getUpdateState, saveUpdateState } from "./storage.js";

const updateLogger = createExtensionLogger("background:update-checker");

const HOURS_24_MS = 24 * 60 * 60 * 1000;

/**
 * Compare two semver version strings.
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".");
  const parts2 = v2.split(".");
  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const num1 = parseInt(parts1[i] ?? "0", 10);
    const num2 = parseInt(parts2[i] ?? "0", 10);

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

/**
 * Check if an update is available from the server.
 */
export async function checkForUpdate(config: ExtensionConfig): Promise<UpdateCheckResult> {
  const currentVersion = chrome.runtime.getManifest().version;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const masterUserId = await getStoredMasterUserId();
    const { payload } = await fetchServerJson<{ ok: boolean; data?: ExtensionVersionInfo }>({
      url: `${config.SERVER_URL}/api/extension/version`,
      method: "GET",
      masterUserId,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!payload.ok || !payload.data) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        versionInfo: null,
      };
    }

    const latestVersion = payload.data.version;
    const comparison = compareVersions(latestVersion, currentVersion);

    if (comparison <= 0) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion,
        versionInfo: null,
      };
    }

    // Check if this version is currently ignored
    const updateState = await getUpdateState();
    if (
      updateState?.ignoredVersion === latestVersion &&
      updateState?.dismissedAt
    ) {
      const dismissedAt = new Date(updateState.dismissedAt).getTime();
      if (Date.now() - dismissedAt < HOURS_24_MS) {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion,
          versionInfo: null,
        };
      }
    }

    // Persist update state
    const newState: UpdateState = {
      hasUpdate: true,
      currentVersion,
      latestVersion,
      releaseNotes: payload.data.releaseNotes,
      downloadUrl: payload.data.downloadUrl,
      forceUpdate: payload.data.forceUpdate,
      ignoredVersion: null,
      dismissedAt: null,
    };
    await saveUpdateState(newState);

    // Show badge
    await chrome.action.setBadgeText({ text: "1" });
    await chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });

    // Show notification for forced updates
    if (payload.data.forceUpdate) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Tenways Octo Update Required",
        message: `A new version ${latestVersion} is available. Please update to continue.`,
      });
    }

    return {
      hasUpdate: true,
      currentVersion,
      latestVersion,
      versionInfo: payload.data,
    };
  } catch (err) {
    updateLogger.error("Update check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      versionInfo: null,
    };
  }
}

/**
 * Download the update zip via Chrome downloads API.
 */
export async function downloadUpdate(versionInfo: ExtensionVersionInfo): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: versionInfo.downloadUrl,
        filename: `tenways-octo-${versionInfo.version}-update.zip`,
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (downloadId === undefined) {
          reject(new Error("Download failed: no download ID returned"));
          return;
        }
        resolve();
      },
    );
  });
}

/**
 * Clear the update badge from the extension icon.
 */
export async function clearUpdateBadge(): Promise<void> {
  await chrome.action.setBadgeText({ text: "" });
}

/**
 * Ignore the current version update and clear the badge.
 */
export async function ignoreCurrentVersion(version: string): Promise<void> {
  const updateState = await getUpdateState();

  const newState: UpdateState = {
    hasUpdate: updateState?.hasUpdate ?? false,
    currentVersion: updateState?.currentVersion ?? chrome.runtime.getManifest().version,
    latestVersion: updateState?.latestVersion ?? version,
    releaseNotes: updateState?.releaseNotes ?? "",
    downloadUrl: updateState?.downloadUrl ?? "",
    forceUpdate: updateState?.forceUpdate ?? false,
    ignoredVersion: version,
    dismissedAt: new Date().toISOString(),
  };

  await saveUpdateState(newState);
  await clearUpdateBadge();
}
