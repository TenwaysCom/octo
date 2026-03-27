import type { BackgroundDefinition } from "wxt";
import { defineBackground } from "wxt/utils/define-background";

const background: BackgroundDefinition = defineBackground(() => {
  void import("../background/router.js");
});

export default background;
