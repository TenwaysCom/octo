import type { AutomationActionConfig } from "./public-config.controller.js";

export const AUTOMATION_ACTIONS = {
  analyze: {
    key: "analyze",
    title: "分析当前页面",
    style: "primary",
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
  bugTicketToSupport: {
    key: "bug-ticket-to-support",
    title: "Bug Ticket to Support",
    description: "将 Meegle Production Bug 的 Lark ticket 推进到 support 处理流。",
    style: "primary",
    interaction: {
      type: "direct_execute",
    },
    executor: {
      type: "backend_api",
      operation: "meegle.production_bug.bug_ticket_to_support",
      method: "POST",
      route: "/api/meegle/workitem/bug-ticket-to-support",
    },
  },
  storyPrdToSimplified: {
    key: "story-prd-to-simplified",
    title: "研发返讲 Story",
    description: "读取 Story Summary，经 Kimi ACP 生成简化需求确认并覆盖写入 Tech Summary。",
    style: "primary",
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
