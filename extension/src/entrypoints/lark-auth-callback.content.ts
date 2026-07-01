import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: ["http://localhost/api/lark/auth/callback*"],
  async main() {
    await import("../content-scripts/lark-auth-callback.js");
  },
});

export default contentScript;
