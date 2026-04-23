import { defineBackground } from "wxt/utils/define-background";
import "../background/router.js";
import { checkForUpdate } from "../background/update-checker.js";
import { getConfig } from "../background/config.js";
import { createExtensionLogger } from "../logger.js";

const bgLogger = createExtensionLogger("background:startup");

export default defineBackground(() => {
  async function runUpdateCheck() {
    try {
      const config = await getConfig();
      await checkForUpdate(config);
    } catch (err) {
      bgLogger.error("Update check failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Check on startup
  void runUpdateCheck();

  // Check on install/update
  chrome.runtime.onInstalled.addListener(() => {
    void runUpdateCheck();
  });

  // Periodic check every 24 hours
  chrome.alarms.create("check-update", { periodInMinutes: 1440 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "check-update") {
      void runUpdateCheck();
    }
  });
});
