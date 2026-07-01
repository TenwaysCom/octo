import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: [
    "https://meegle.com/*",
    "https://*.meegle.com/*",
    "https://project.larksuite.com/*",
  ],
  async main() {
    await import("../content-scripts/meegle.js");
  },
});

export default contentScript;
