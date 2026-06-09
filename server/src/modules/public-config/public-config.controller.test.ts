import { describe, expect, it } from "vitest";
import {
  configurePublicConfigController,
  getExtensionPageConfigController,
  getPublicConfigController,
  getServerApiCatalogController,
} from "./public-config.controller.js";

describe("public-config.controller", () => {
  it("returns only public extension config", async () => {
    configurePublicConfigController({
      MEEGLE_PLUGIN_ID: "MII_ABD86EEDB9E8CA36",
      LARK_APP_ID: "cli_test_public",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
      CLIENT_DEBUG_LOG_UPLOAD_ENABLED: true,
    });

    await expect(getPublicConfigController()).resolves.toEqual({
      ok: true,
      data: {
        MEEGLE_PLUGIN_ID: "MII_ABD86EEDB9E8CA36",
        LARK_APP_ID: "cli_test_public",
        MEEGLE_BASE_URL: "https://project.larksuite.com",
        LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
        LARK_OAUTH_SCOPE: "offline_access contact:user.base:readonly bitable:app base:record:retrieve im:message.send_as_user im:message.reactions:write_only im:chat:readonly im:message",
        CLIENT_DEBUG_LOG_UPLOAD_ENABLED: true,
      },
    });
  });

  it("resolves Lark bulk-create page automation from the URL", async () => {
    await expect(
      getExtensionPageConfigController({
        url: "https://nsghpcq7ar4z.sg.larksuite.com/base/XO0cbnxMIaralRsbBEolboEFgZc?table=tblUfu71xwdul3NH&view=vewMs17Tqk",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        pageConfig: {
          platform: "lark",
          pageType: "lark_base_bulk_create_view",
          matchedRuleId: "lark.base.bulk-create-view",
          sidebar: {
            injectPageElements: true,
            sidebarButtonEnabled: true,
          },
          automationActions: [
            { key: "analyze" },
            { key: "bulk-create-meegle-tickets" },
          ],
        },
      },
    });
  });

  it("resolves Production Bug detail page to the support automation action", async () => {
    await expect(
      getExtensionPageConfigController({
        url: "https://project.larksuite.com/OPS/production_bug/detail/123456",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        pageConfig: {
          platform: "meegle",
          pageType: "meegle_production_bug_detail",
          matchedRuleId: "meegle.production-bug.detail",
          automationActions: expect.arrayContaining([
            expect.objectContaining({
              key: "bug-ticket-to-support",
              executor: expect.objectContaining({
                type: "backend_api",
                operation: "meegle.production_bug.bug_ticket_to_support",
                route: "/api/meegle/workitem/bug-ticket-to-support",
              }),
            }),
          ]),
        },
      },
    });
  });

  it("returns unsupported page config for unrelated URLs", async () => {
    await expect(
      getExtensionPageConfigController({
        url: "https://example.com/not-supported",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        pageConfig: {
          platform: "unsupported",
          sidebar: {
            injectPageElements: false,
            sidebarButtonEnabled: false,
          },
          automationActions: [],
        },
      },
    });
  });

  it("returns categorized server API catalog", async () => {
    const result = await getServerApiCatalogController();

    expect(result.data.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "workflows",
          routes: expect.arrayContaining([
            expect.objectContaining({
              method: "POST",
              path: "/api/meegle/workitem/bug-ticket-to-support",
            }),
          ]),
        }),
      ]),
    );
  });
});
