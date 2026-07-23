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
    title: "批量创建 Meegle Item",
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
  larkBugAnalyze: {
    key: "lark-bug-analyze",
    title: "分析 bug",
    description: "读取 Meegle Production Bug 或 Lark 记录，经 Kimi ACP 生成 Bug 分析。",
    style: "primary",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "direct_execute",
    },
    executor: {
      type: "backend_api",
      operation: "lark.bug.analyze",
      method: "POST",
      route: "/api/lark-bug/analyze",
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
  githubQuickScan: {
    key: "github-quick-scan",
    title: "Quick scan（后台执行）",
    description: "后台扫描当前 PR 的结构性风险；完成后自动回写 PR 评论并通知你。",
    style: "default",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "direct_execute",
    },
    executor: {
      type: "backend_api",
      operation: "github.pr.quick_scan",
      method: "POST",
      route: "/api/github/pr/review",
    },
    execution: {
      mode: "async",
      submit: {
        message: "已提交后台 Quick scan；可关闭插件，完成后会通知你。",
        style: "info",
      },
      completion: {
        status: {
          method: "GET",
          route: "/api/github/pr/review/:actionRunId",
          pollIntervalMs: 5000,
        },
        success: {
          message: "Quick scan 已完成，审查结果已回写到 PR。",
          style: "success",
          notification: {
            title: "Quick scan 已完成",
            message: "PR 审查结果已回写到 GitHub。",
          },
        },
        failure: {
          message: "Quick scan 执行失败，请查看任务状态或日志。",
          style: "error",
        },
      },
    },
  },
  githubDeepReview: {
    key: "github-deep-review",
    title: "Deep review（后台执行）",
    description: "后台执行当前 PR 的深度代码审查；完成后自动回写 PR 评论并通知你。",
    style: "primary",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: {
      type: "direct_execute",
    },
    executor: {
      type: "backend_api",
      operation: "github.pr.deep_review",
      method: "POST",
      route: "/api/github/pr/review",
    },
    execution: {
      mode: "async",
      submit: {
        message: "已提交后台 Deep review；可关闭插件，完成后会通知你。",
        style: "info",
      },
      completion: {
        status: {
          method: "GET",
          route: "/api/github/pr/review/:actionRunId",
          pollIntervalMs: 5000,
        },
        success: {
          message: "Deep review 已完成，审查结果已回写到 PR。",
          style: "success",
          notification: {
            title: "Deep review 已完成",
            message: "PR 深度审查结果已回写到 GitHub。",
          },
        },
        failure: {
          message: "Deep review 执行失败，请查看任务状态或日志。",
          style: "error",
        },
      },
    },
  },
  githubCodeReviewFeedback: {
    key: "github-code-review-feedback",
    title: "Code review feedback（后台执行）",
    description: "审查当前 PR，并将结构化反馈写入 Lark Base。",
    style: "default",
    placements: [{ surface: "popup" }, { surface: "sidebar" }],
    interaction: { type: "direct_execute" },
    executor: {
      type: "backend_api",
      operation: "github.pr.code_review_feedback",
      method: "POST",
      route: "/api/github/pr/code-review-feedback",
    },
    execution: {
      mode: "async",
      submit: { message: "已提交 Code review feedback；完成后会通知你。", style: "info" },
      completion: {
        status: {
          method: "GET",
          route: "/api/github/pr/code-review-feedback/:actionRunId",
          pollIntervalMs: 5000,
        },
        success: {
          message: "Code review feedback 已写入 Lark Base。",
          style: "success",
          notification: { title: "Code review feedback 已完成", message: "反馈已写入 Lark Base。" },
        },
        failure: { message: "Code review feedback 执行失败，请查看任务状态或日志。", style: "error" },
      },
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
