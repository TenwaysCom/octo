import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: ["https://*.feishu.cn/*", "https://*.larksuite.com/*"],
  excludeMatches: ["https://project.larksuite.com/*"],
  async main() {
    await import("../content-scripts/lark.js");
  },
});

export default contentScript;
