import assert from "node:assert/strict";
import test from "node:test";
import { getPluginLoginFailureMessage } from "./usePluginLogin.js";

test("maps plugin approval failures to the existing user guidance", () => {
  assert.match(getPluginLoginFailureMessage("LARK_AUTH_REQUIRED"), /Lark 授权/);
  assert.match(getPluginLoginFailureMessage("ENVIRONMENT_MISMATCH"), /环境不一致/);
  assert.match(getPluginLoginFailureMessage("PLUGIN_LOGIN_TIMEOUT"), /确认插件已安装/);
});
