import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";
import { installOctoWebPresenceBridge } from "../web-presence-bridge.js";

function toOriginMatch(origin: string): string {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}

const octoWebOrigin = import.meta.env.WXT_PUBLIC_OCTO_WEB_ORIGIN?.trim() || "http://localhost:4173";

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: [toOriginMatch(octoWebOrigin)],
  runAt: "document_start",
  main() {
    installOctoWebPresenceBridge({
      version: chrome.runtime.getManifest().version,
    });
  },
});

export default contentScript;
