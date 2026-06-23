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

  it("resolves Lark base create Meegle item actions from base and table URL", async () => {
    await expect(
      getExtensionPageConfigController({
        url: "https://nsghpcq7ar4z.sg.larksuite.com/base/XO0cbnxMIaralRsbBEolboEFgZc?table=tblUfu71xwdul3NH",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        pageConfig: {
          platform: "lark",
          pageType: "lark_base_create_meegle_item",
          matchedRuleId: "lark.base.create-meegle-item",
          sidebar: {
            injectPageElements: true,
            sidebarButtonEnabled: true,
          },
          automationActions: [
            { key: "analyze" },
            {
              key: "bulk-create-meegle-tickets",
              title: "创建 Meegle Item",
              interaction: { type: "preview_confirm" },
            },
          ],
        },
      },
    });
  });

  it("resolves Lark record pages to create Meegle item action", async () => {
    await expect(
      getExtensionPageConfigController({
        url: "https://nsghpcq7ar4z.sg.larksuite.com/record/KxOYr6CJKeWYktcI2GilrfRAgeg",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        pageConfig: {
          platform: "lark",
          pageType: "lark_record_create_meegle_item",
          matchedRuleId: "lark.record.create-meegle-item",
          automationActions: [
            {
              key: "create-meegle-item",
              title: "创建 Meegle Item",
              interaction: { type: "direct_execute" },
            },
          ],
        },
      },
    });
  });

  it("does not return automation actions for unmatched Lark pages", async () => {
    await expect(
      getExtensionPageConfigController({
        url: "https://nsghpcq7ar4z.sg.larksuite.com/wiki/not-target",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        pageConfig: {
          platform: "lark",
          pageType: "lark",
          matchedRuleId: "lark.unmatched",
          automationActions: [],
        },
      },
    });
  });

  it("resolves Production Bug detail page to the update Lark automation action", async () => {
    const result = await getExtensionPageConfigController({
      url: "https://project.larksuite.com/OPS/production_bug/detail/123456",
    });
    const actionKeys = result.data.pageConfig.automationActions.map((action) => action.key);

    expect(result).toMatchObject({
      ok: true,
      data: {
        pageConfig: {
          platform: "meegle",
          pageType: "meegle_production_bug_detail",
          matchedRuleId: "meegle.production-bug.detail",
          automationActions: expect.arrayContaining([
            expect.objectContaining({
              key: "update-lark-and-push",
              title: "更新 Lark 并推送",
              interaction: { type: "direct_execute" },
              executor: expect.objectContaining({
                type: "backend_api",
                operation: "meegle.workitem.update_lark_and_push",
                route: "/api/meegle/workitem/update-lark-and-push",
              }),
            }),
          ]),
        },
      },
    });
    expect(actionKeys).toEqual(["update-lark-and-push", "create-github-branch"]);
    expect(actionKeys).not.toContain("bug-ticket-to-support");
  });

  it("resolves Story detail page to story PRD simplified action", async () => {
    const result = await getExtensionPageConfigController({
      url: "https://project.larksuite.com/OPS/story/detail/123456",
    });
    const actionKeys = result.data.pageConfig.automationActions.map((action) => action.key);

    expect(result).toMatchObject({
      ok: true,
      data: {
        pageConfig: {
          platform: "meegle",
          pageType: "meegle_workitem_detail",
          matchedRuleId: "meegle.story.detail",
          matchedRuleIds: ["meegle.story.detail"],
          automationActions: expect.arrayContaining([
            expect.objectContaining({
              key: "story-prd-to-simplified",
              title: "研发Review Story",
              interaction: { type: "direct_execute" },
              executor: expect.objectContaining({
                type: "backend_api",
                operation: "meegle.story.prd_to_simplified",
                route: "/api/meegle/workitem/story-prd-to-simplified",
              }),
            }),
          ]),
        },
      },
    });
    expect(actionKeys).toEqual([
      "update-lark-and-push",
      "create-github-branch",
      "story-prd-to-simplified",
    ]);
  });

  it("resolves numeric Production Bug pages with a unique rule id", async () => {
    const result = await getExtensionPageConfigController({
      url: "https://project.larksuite.com/OPS/6932e40429d1cd8aac635c82/detail/123456",
    });
    const actionKeys = result.data.pageConfig.automationActions.map((action) => action.key);

    expect(result).toMatchObject({
      ok: true,
      data: {
        pageConfig: {
          platform: "meegle",
          pageType: "meegle_production_bug_detail",
          matchedRuleId: "meegle.production-bug.detail-numeric",
          matchedRuleIds: ["meegle.production-bug.detail-numeric"],
          automationActions: expect.arrayContaining([
            expect.objectContaining({
              key: "update-lark-and-push",
              title: "更新 Lark 并推送",
            }),
            expect.objectContaining({
              key: "create-github-branch",
              interaction: { type: "preview_form_confirm" },
            }),
          ]),
        },
      },
    });
    expect(actionKeys).toEqual(["update-lark-and-push", "create-github-branch"]);
    expect(actionKeys).not.toContain("bug-ticket-to-support");
  });

  it("resolves GitHub issue pages to the issue lookup action", async () => {
    await expect(
      getExtensionPageConfigController({
        url: "https://github.com/TenwaysCom/octo/issues/35",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        pageConfig: {
          platform: "github",
          pageType: "github_issue",
          matchedRuleId: "github.issue",
          automationActions: [
            {
              key: "lookup-github-issue",
              title: "查询 Issue 关联的 Meegle 工作项",
              interaction: { type: "direct_result" },
            },
          ],
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
    const workflowRoutes = result.data.categories.find((category) => category.key === "workflows")?.routes ?? [];
    const workflowPaths = workflowRoutes.map((route) => route.path);

    expect(result.data.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "workflows",
          routes: expect.arrayContaining([
            expect.objectContaining({
              method: "POST",
              path: "/api/meegle/workitem/update-lark-and-push",
            }),
            expect.objectContaining({
              method: "POST",
              path: "/api/meegle/workitem/story-prd-to-simplified",
            }),
          ]),
        }),
      ]),
    );
    expect(workflowPaths).not.toContain("/api/meegle/workitem/bug-ticket-to-support");
  });
});
