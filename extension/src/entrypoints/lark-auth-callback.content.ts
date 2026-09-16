import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";
import { LARK_OAUTH_CALLBACK_CONTENT_MATCHES } from "../web-origin-config.js";

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: LARK_OAUTH_CALLBACK_CONTENT_MATCHES,
  async main() {
    await import("../content-scripts/lark-auth-callback.js");
  },
});

export default contentScript;
