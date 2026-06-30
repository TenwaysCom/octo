import type { AutomationActionConfig } from "./public-config.controller.js";

export const AUTOMATION_ACTIONS = {
  analyze: {
    key: "analyze",
    title: "分析当前页面",
    style: "primary",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "open_panel",
    },
    executor: {
      type: "frontend",
      actionKey: "analyze",
    },
  },
  createMeegleItem: {
    key: "create-meegle-item",
    title: "创建 Meegle Item",
    style: "default",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "direct_execute",
    },
    executor: {
      type: "frontend",
      actionKey: "create-meegle-item",
    },
  },
  bulkCreateMeegleTickets: {
    key: "bulk-create-meegle-tickets",
    title: "创建 Meegle Item",
    style: "default",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "preview_confirm",
    },
    executor: {
      type: "frontend",
      actionKey: "bulk-create-meegle-tickets",
    },
  },
  updateLarkAndPush: {
    key: "update-lark-and-push",
    title: "更新 Lark 并推送",
    style: "primary",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "direct_execute",
    },
    executor: {
      type: "backend_api",
      operation: "meegle.workitem.update_lark_and_push",
      method: "POST",
      route: "/api/meegle/workitem/update-lark-and-push",
    },
  },
  storyPrdToSimplified: {
    key: "story-prd-to-simplified",
    title: "研发Review Story",
    description: "读取 Story Summary，经 Kimi ACP 生成简化需求确认并覆盖写入 Tech Summary。",
    style: "primary",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "direct_execute",
    },
    executor: {
      type: "backend_api",
      operation: "meegle.story.prd_to_simplified",
      method: "POST",
      route: "/api/meegle/workitem/story-prd-to-simplified",
    },
  },
  createGithubBranch: {
    key: "create-github-branch",
    title: "创建 GitHub 分支",
    style: "default",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "preview_form_confirm",
    },
    executor: {
      type: "frontend",
      actionKey: "create-github-branch",
    },
  },
  lookupGithubPr: {
    key: "lookup-github-pr",
    title: "查询 PR 关联的 Meegle 工作项",
    style: "primary",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "direct_result",
    },
    executor: {
      type: "frontend",
      actionKey: "lookup-github-pr",
    },
  },
  lookupGithubIssue: {
    key: "lookup-github-issue",
    title: "查询 Issue 关联的 Meegle 工作项",
    style: "primary",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "direct_result",
    },
    executor: {
      type: "frontend",
      actionKey: "lookup-github-issue",
    },
  },
} satisfies Record<string, AutomationActionConfig>;

export type AutomationActionId = keyof typeof AUTOMATION_ACTIONS;
