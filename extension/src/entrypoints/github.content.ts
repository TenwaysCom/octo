import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: ["https://github.com/*"],
  async main() {
    await import("../content-scripts/github.js");
  },
});

export default contentScript;
