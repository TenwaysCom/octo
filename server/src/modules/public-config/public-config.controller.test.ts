import { describe, expect, it } from "vitest";
import {
  configurePublicConfigController,
  getPublicConfigController,
} from "./public-config.controller.js";

describe("public-config.controller", () => {
  it("returns only public extension config", async () => {
    configurePublicConfigController({
      MEEGLE_PLUGIN_ID: "MII_ABD86EEDB9E8CA36",
      LARK_APP_ID: "cli_test_public",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
    });

    await expect(getPublicConfigController()).resolves.toEqual({
      ok: true,
      data: {
        MEEGLE_PLUGIN_ID: "MII_ABD86EEDB9E8CA36",
        LARK_APP_ID: "cli_test_public",
        MEEGLE_BASE_URL: "https://project.larksuite.com",
        LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
        LARK_OAUTH_SCOPE: "offline_access contact:user.base:readonly bitable:app im:message.send_as_user im:message.reactions:write_only im:chat:readonly im:message",
      },
    });
  });
});
