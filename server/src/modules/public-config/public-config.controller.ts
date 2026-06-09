export interface PublicConfigResponse {
  ok: true;
  data: {
    MEEGLE_PLUGIN_ID: string;
    LARK_APP_ID: string;
    LARK_OAUTH_CALLBACK_URL: string;
    MEEGLE_BASE_URL: string;
    LARK_OAUTH_SCOPE: string;
    CLIENT_DEBUG_LOG_UPLOAD_ENABLED: boolean;
  };
}

export type ExtensionPagePlatform = "lark" | "meegle" | "github" | "unsupported";

export interface AutomationActionConfig {
  key: string;
  title: string;
  description?: string;
  style?: "primary" | "default";
  executor:
    | {
        type: "frontend";
        actionKey: string;
      }
    | {
        type: "backend_api";
        operation: string;
        method: "POST";
        route: string;
      };
}

export interface ExtensionPageConfig {
  platform: ExtensionPagePlatform;
  pageType:
    | "lark"
    | "lark_base_bulk_create_view"
    | "meegle"
    | "meegle_workitem_detail"
    | "meegle_production_bug_detail"
    | "github_pr"
    | "unsupported";
  matchedRuleId: string;
  sidebar: {
    injectPageElements: boolean;
    sidebarButtonEnabled: boolean;
    keyboardShortcutEnabled: boolean;
  };
  automationActions: AutomationActionConfig[];
}

export interface ExtensionPageConfigResponse {
  ok: true;
  data: {
    pageConfig: ExtensionPageConfig;
  };
}

export interface ServerApiCatalogResponse {
  ok: true;
  data: {
    categories: Array<{
      key: string;
      title: string;
      routes: Array<{
        method: "GET" | "POST";
        path: string;
        description: string;
      }>;
    }>;
  };
}

export interface PublicConfigControllerDeps {
  MEEGLE_PLUGIN_ID: string;
  LARK_APP_ID: string;
  LARK_OAUTH_CALLBACK_URL: string;
  MEEGLE_BASE_URL: string;
  LARK_OAUTH_SCOPE: string;
  CLIENT_DEBUG_LOG_UPLOAD_ENABLED: boolean;
}

let publicConfigDeps: PublicConfigControllerDeps = {
  MEEGLE_PLUGIN_ID: "",
  LARK_APP_ID: "",
  LARK_OAUTH_CALLBACK_URL: "",
  MEEGLE_BASE_URL: "https://project.larksuite.com",
  LARK_OAUTH_SCOPE: "offline_access contact:user.base:readonly bitable:app base:record:retrieve im:message.send_as_user im:message.reactions:write_only im:chat:readonly im:message",
  CLIENT_DEBUG_LOG_UPLOAD_ENABLED: false,
};

const TARGET_LARK_BASE_ID = "XO0cbnxMIaralRsbBEolboEFgZc";
const TARGET_LARK_TABLE_ID = "tblUfu71xwdul3NH";
const TARGET_LARK_VIEW_ID = "vewMs17Tqk";
const PRODUCTION_BUG_TYPE_API_NAME = "production_bug";
const PRODUCTION_BUG_TYPE_KEY = "6932e40429d1cd8aac635c82";

const SIDEBAR_ENABLED = {
  injectPageElements: true,
  sidebarButtonEnabled: true,
  keyboardShortcutEnabled: true,
};

const SIDEBAR_DISABLED = {
  injectPageElements: false,
  sidebarButtonEnabled: false,
  keyboardShortcutEnabled: false,
};

const ANALYZE_ACTION: AutomationActionConfig = {
  key: "analyze",
  title: "分析当前页面",
  style: "primary",
  executor: {
    type: "frontend",
    actionKey: "analyze",
  },
};

const LARK_BULK_CREATE_ACTION: AutomationActionConfig = {
  key: "bulk-create-meegle-tickets",
  title: "批量创建 MEEGLE TICKET",
  style: "default",
  executor: {
    type: "frontend",
    actionKey: "bulk-create-meegle-tickets",
  },
};

const MEEGLE_UPDATE_LARK_AND_PUSH_ACTION: AutomationActionConfig = {
  key: "update-lark-and-push",
  title: "更新Lark及推送",
  style: "primary",
  executor: {
    type: "backend_api",
    operation: "meegle.workitem.update_lark_and_push",
    method: "POST",
    route: "/api/meegle/workitem/update-lark-and-push",
  },
};

const BUG_TICKET_TO_SUPPORT_ACTION: AutomationActionConfig = {
  key: "bug-ticket-to-support",
  title: "Bug Ticket to Support",
  description: "将 Meegle Production Bug 的 Lark ticket 推进到 support 处理流。",
  style: "primary",
  executor: {
    type: "backend_api",
    operation: "meegle.production_bug.bug_ticket_to_support",
    method: "POST",
    route: "/api/meegle/workitem/bug-ticket-to-support",
  },
};

const CREATE_GITHUB_BRANCH_ACTION: AutomationActionConfig = {
  key: "create-github-branch",
  title: "创建 GitHub 分支",
  style: "default",
  executor: {
    type: "frontend",
    actionKey: "create-github-branch",
  },
};

const GITHUB_LOOKUP_PR_ACTION: AutomationActionConfig = {
  key: "lookup-github-pr",
  title: "查询 PR 关联的 Meegle 工作项",
  style: "primary",
  executor: {
    type: "frontend",
    actionKey: "lookup-github-pr",
  },
};

export function configurePublicConfigController(
  deps: Partial<PublicConfigControllerDeps>,
): void {
  publicConfigDeps = {
    ...publicConfigDeps,
    ...deps,
  };
}

export async function getPublicConfigController(): Promise<PublicConfigResponse> {
  return {
    ok: true,
    data: {
      MEEGLE_PLUGIN_ID: publicConfigDeps.MEEGLE_PLUGIN_ID,
      LARK_APP_ID: publicConfigDeps.LARK_APP_ID,
      LARK_OAUTH_CALLBACK_URL: publicConfigDeps.LARK_OAUTH_CALLBACK_URL,
      MEEGLE_BASE_URL: publicConfigDeps.MEEGLE_BASE_URL,
      LARK_OAUTH_SCOPE: publicConfigDeps.LARK_OAUTH_SCOPE,
      CLIENT_DEBUG_LOG_UPLOAD_ENABLED: publicConfigDeps.CLIENT_DEBUG_LOG_UPLOAD_ENABLED,
    },
  };
}

function getUrl(input?: string): URL | null {
  if (!input) {
    return null;
  }

  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isMeegleHost(hostname: string): boolean {
  return (
    hostname === "project.larksuite.com" ||
    hostname === "meegle.com" ||
    hostname.endsWith(".meegle.com")
  );
}

function isLarkHost(hostname: string): boolean {
  if (hostname === "project.larksuite.com") {
    return false;
  }

  return (
    hostname === "feishu.cn" ||
    hostname.endsWith(".feishu.cn") ||
    hostname === "larksuite.com" ||
    hostname.endsWith(".larksuite.com")
  );
}

function isGitHubHost(hostname: string): boolean {
  return hostname === "github.com" || hostname.endsWith(".github.com");
}

function isGitHubPrPath(pathname: string): boolean {
  return /\/[^/]+\/[^/]+\/pull\/\d+/.test(pathname);
}

function getLarkBaseContext(url: URL): {
  baseId?: string;
  tableId?: string;
  viewId?: string;
} {
  const segments = url.pathname.split("/").filter(Boolean);
  const baseIndex = segments.indexOf("base");
  const tableIndex = segments.indexOf("table");

  return {
    baseId:
      (baseIndex >= 0 ? segments[baseIndex + 1] : undefined) ||
      url.searchParams.get("base") ||
      undefined,
    tableId:
      (tableIndex >= 0 ? segments[tableIndex + 1] : undefined) ||
      url.searchParams.get("table") ||
      undefined,
    viewId: url.searchParams.get("view") || undefined,
  };
}

function getMeegleWorkitemPath(url: URL): {
  projectKey: string;
  workItemTypeKey: string;
  workItemId: string;
} | null {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 4 || segments[2] !== "detail") {
    return null;
  }

  return {
    projectKey: segments[0],
    workItemTypeKey: segments[1],
    workItemId: segments[3],
  };
}

function unsupportedPageConfig(): ExtensionPageConfig {
  return {
    platform: "unsupported",
    pageType: "unsupported",
    matchedRuleId: "unsupported",
    sidebar: SIDEBAR_DISABLED,
    automationActions: [],
  };
}

export async function getExtensionPageConfigController(input: {
  url?: string;
}): Promise<ExtensionPageConfigResponse> {
  const url = getUrl(input.url);

  if (!url) {
    return {
      ok: true,
      data: {
        pageConfig: unsupportedPageConfig(),
      },
    };
  }

  if (isLarkHost(url.hostname)) {
    const context = getLarkBaseContext(url);
    const isBulkCreateView =
      context.baseId === TARGET_LARK_BASE_ID &&
      context.tableId === TARGET_LARK_TABLE_ID &&
      context.viewId === TARGET_LARK_VIEW_ID;

    return {
      ok: true,
      data: {
        pageConfig: {
          platform: "lark",
          pageType: isBulkCreateView ? "lark_base_bulk_create_view" : "lark",
          matchedRuleId: isBulkCreateView ? "lark.base.bulk-create-view" : "lark.any",
          sidebar: SIDEBAR_ENABLED,
          automationActions: isBulkCreateView
            ? [ANALYZE_ACTION, LARK_BULK_CREATE_ACTION]
            : [ANALYZE_ACTION],
        },
      },
    };
  }

  if (isMeegleHost(url.hostname)) {
    const workitem = getMeegleWorkitemPath(url);
    const isProductionBug =
      workitem?.workItemTypeKey === PRODUCTION_BUG_TYPE_API_NAME ||
      workitem?.workItemTypeKey === PRODUCTION_BUG_TYPE_KEY;

    return {
      ok: true,
      data: {
        pageConfig: {
          platform: "meegle",
          pageType: isProductionBug
            ? "meegle_production_bug_detail"
            : workitem
              ? "meegle_workitem_detail"
              : "meegle",
          matchedRuleId: isProductionBug
            ? "meegle.production-bug.detail"
            : workitem
              ? "meegle.workitem.detail"
              : "meegle.any",
          sidebar: SIDEBAR_ENABLED,
          automationActions: isProductionBug
            ? [BUG_TICKET_TO_SUPPORT_ACTION, CREATE_GITHUB_BRANCH_ACTION]
            : workitem
              ? [MEEGLE_UPDATE_LARK_AND_PUSH_ACTION, CREATE_GITHUB_BRANCH_ACTION]
              : [],
        },
      },
    };
  }

  if (isGitHubHost(url.hostname) && isGitHubPrPath(url.pathname)) {
    return {
      ok: true,
      data: {
        pageConfig: {
          platform: "github",
          pageType: "github_pr",
          matchedRuleId: "github.pr",
          sidebar: SIDEBAR_ENABLED,
          automationActions: [GITHUB_LOOKUP_PR_ACTION],
        },
      },
    };
  }

  return {
    ok: true,
    data: {
      pageConfig: unsupportedPageConfig(),
    },
  };
}

export async function getServerApiCatalogController(): Promise<ServerApiCatalogResponse> {
  return {
    ok: true,
    data: {
      categories: [
        {
          key: "system",
          title: "System / Config",
          routes: [
            { method: "GET", path: "/health", description: "服务健康检查" },
            { method: "GET", path: "/api/config/public", description: "插件公开运行配置" },
            { method: "GET", path: "/api/config/page", description: "按页面 URL 解析插件页面配置" },
            { method: "GET", path: "/api/config/server-api-catalog", description: "按业务分类返回 server API 清单" },
            { method: "GET", path: "/api/extension/version", description: "插件版本与更新信息" },
            { method: "POST", path: "/api/debug/client-log", description: "上传插件客户端调试日志" },
          ],
        },
        {
          key: "identity-auth",
          title: "Identity / Auth",
          routes: [
            { method: "POST", path: "/api/identity/resolve", description: "解析 Lark / Meegle / GitHub 身份到 masterUserId" },
            { method: "POST", path: "/api/meegle/auth/exchange", description: "Meegle auth code 换用户 token" },
            { method: "POST", path: "/api/meegle/auth/status", description: "查询 Meegle 授权状态" },
            { method: "POST", path: "/api/lark/auth/exchange", description: "Lark OAuth code 换 token" },
            { method: "POST", path: "/api/lark/auth/refresh", description: "刷新 Lark 授权状态" },
            { method: "POST", path: "/api/lark/auth/status", description: "查询 Lark 授权状态" },
            { method: "POST", path: "/api/lark/auth/session", description: "创建 Lark OAuth 会话" },
            { method: "POST", path: "/api/lark/user-info", description: "读取 Lark 用户信息" },
            { method: "GET", path: "/api/lark/auth/callback", description: "Lark OAuth 回调入口" },
          ],
        },
        {
          key: "workflows",
          title: "Workflow Automation",
          routes: [
            { method: "POST", path: "/api/pm/analysis/run", description: "PM 页面分析" },
            { method: "POST", path: "/api/lark-base/update-meegle-link", description: "回写 Lark Base Meegle 链接" },
            { method: "POST", path: "/api/lark-base/get-record-url", description: "生成 Lark Base 记录 URL" },
            { method: "POST", path: "/api/lark-base/create-meegle-workitem", description: "从 Lark Base 记录创建 Meegle 工作项" },
            { method: "POST", path: "/api/lark-base/bulk-preview-meegle-workitems", description: "预览批量创建 Meegle 工作项" },
            { method: "POST", path: "/api/lark-base/bulk-create-meegle-workitems", description: "批量创建 Meegle 工作项" },
            { method: "POST", path: "/api/meegle/workitem/update-lark-and-push", description: "Meegle 工作项更新 Lark 并推送消息" },
            { method: "POST", path: "/api/meegle/workitem/bug-ticket-to-support", description: "Production Bug ticket 推进到 support 处理流" },
          ],
        },
        {
          key: "assistant",
          title: "ACP / Kimi",
          routes: [
            { method: "POST", path: "/api/acp/kimi/chat", description: "Kimi ACP 聊天流" },
            { method: "POST", path: "/api/acp/kimi/sessions/list", description: "列出 Kimi ACP 会话" },
            { method: "POST", path: "/api/acp/kimi/sessions/load", description: "加载 Kimi ACP 会话" },
            { method: "POST", path: "/api/acp/kimi/sessions/rename", description: "重命名 Kimi ACP 会话" },
            { method: "POST", path: "/api/acp/kimi/sessions/delete", description: "删除 Kimi ACP 会话" },
          ],
        },
        {
          key: "github",
          title: "GitHub",
          routes: [
            { method: "POST", path: "/api/github/branch/preview", description: "预览 GitHub 分支名" },
            { method: "POST", path: "/api/github/branch/create", description: "创建 GitHub 分支" },
            { method: "POST", path: "/api/github/lookup-meegle", description: "按 PR 反查 Meegle 工作项" },
          ],
        },
      ],
    },
  };
}
