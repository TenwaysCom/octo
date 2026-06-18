import type { AutomationActionId } from "./automation-actions.config.js";
import type {
  ExtensionPageConfig,
  ExtensionPagePlatform,
} from "./public-config.controller.js";

export type ExtensionPageType = ExtensionPageConfig["pageType"];

export interface ActionPageRule {
  id: string;
  platform: Exclude<ExtensionPagePlatform, "unsupported">;
  pageType: Exclude<ExtensionPageType, "unsupported">;
  host: string | string[];
  path: string;
  params?: Record<string, string | string[]>;
  query?: Record<string, string>;
  sidebar: ExtensionPageConfig["sidebar"];
  actions: AutomationActionId[];
}

const SIDEBAR_ENABLED = {
  injectPageElements: true,
  sidebarButtonEnabled: true,
  keyboardShortcutEnabled: true,
};

export const ACTION_PAGE_RULES: ActionPageRule[] = [
  {
    id: "lark.base.create-meegle-item",
    platform: "lark",
    pageType: "lark_base_create_meegle_item",
    host: ["*.larksuite.com", "*.feishu.cn"],
    path: "/base/:baseId",
    params: {
      baseId: "XO0cbnxMIaralRsbBEolboEFgZc",
    },
    query: {
      table: "tblUfu71xwdul3NH",
    },
    sidebar: SIDEBAR_ENABLED,
    actions: ["analyze", "bulkCreateMeegleTickets"],
  },
  {
    id: "lark.record.create-meegle-item",
    platform: "lark",
    pageType: "lark_record_create_meegle_item",
    host: ["*.larksuite.com", "*.feishu.cn"],
    path: "/record/:recordId",
    sidebar: SIDEBAR_ENABLED,
    actions: ["createMeegleItem"],
  },
  {
    id: "meegle.workitem.detail",
    platform: "meegle",
    pageType: "meegle_workitem_detail",
    host: "project.larksuite.com",
    path: "/:projectKey/:workItemTypeKey/detail/:workItemId",
    params: {
      workItemTypeKey: ["!production_bug", "!6932e40429d1cd8aac635c82"],
    },
    sidebar: SIDEBAR_ENABLED,
    actions: ["updateLarkAndPush", "createGithubBranch"],
  },
  {
    id: "meegle.production-bug.detail",
    platform: "meegle",
    pageType: "meegle_production_bug_detail",
    host: "project.larksuite.com",
    path: "/:projectKey/production_bug/detail/:workItemId",
    sidebar: SIDEBAR_ENABLED,
    actions: ["updateLarkAndPush", "createGithubBranch"],
  },
  {
    id: "meegle.production-bug.detail-numeric",
    platform: "meegle",
    pageType: "meegle_production_bug_detail",
    host: "project.larksuite.com",
    path: "/:projectKey/6932e40429d1cd8aac635c82/detail/:workItemId",
    sidebar: SIDEBAR_ENABLED,
    actions: ["updateLarkAndPush", "createGithubBranch"],
  },
  {
    id: "github.pr",
    platform: "github",
    pageType: "github_pr",
    host: "github.com",
    path: "/:owner/:repo/pull/:pullNumber",
    sidebar: SIDEBAR_ENABLED,
    actions: ["lookupGithubPr"],
  },
  {
    id: "github.issue",
    platform: "github",
    pageType: "github_issue",
    host: "github.com",
    path: "/:owner/:repo/issues/:issueNumber",
    sidebar: SIDEBAR_ENABLED,
    actions: ["lookupGithubIssue"],
  },
];
