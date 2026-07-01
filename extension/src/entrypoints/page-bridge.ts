import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

export default defineUnlistedScript(async () => {
  await import("../page-bridge/meegle-auth.js");
});
