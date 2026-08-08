import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";
import { OCTO_WEB_CONTENT_MATCHES } from "../environment-config.js";
import { installOctoWebPresenceBridge } from "../web-presence-bridge.js";

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: OCTO_WEB_CONTENT_MATCHES,
  runAt: "document_start",
  main() {
    installOctoWebPresenceBridge({
      version: chrome.runtime.getManifest().version,
      approvePluginLogin: async (challengeId) => new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: "octo.web.plugin-login.approve",
          payload: { challengeId, pageOrigin: window.location.origin },
        }, (response) => {
          const payload = response?.action === "octo.web.plugin-login.approve" ? response.payload : undefined;
          resolve(payload?.status === "approved"
            ? { status: "approved" }
            : { status: "failed", errorCode: payload?.errorCode || "PLUGIN_LOGIN_FAILED" });
        });
      }),
    });
  },
});

export default contentScript;
