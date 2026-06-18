import {
  ACTION_PAGE_RULES,
  type ActionPageRule,
} from "./action-page-rules.config.js";
import {
  AUTOMATION_ACTIONS,
  type AutomationActionId,
} from "./automation-actions.config.js";
import { logger } from "../../logger.js";

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
  interaction:
    | { type: "open_panel" }
    | { type: "preview_confirm" }
    | { type: "preview_form_confirm" }
    | { type: "direct_execute" }
    | { type: "direct_result" };
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
    | "lark_base_create_meegle_item"
    | "lark_record_create_meegle_item"
    | "meegle"
    | "meegle_workitem_detail"
    | "meegle_production_bug_detail"
    | "github_pr"
    | "github_issue"
    | "unsupported";
  matchedRuleId: string;
  matchedRuleIds?: string[];
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

const SIDEBAR_DISABLED = {
  injectPageElements: false,
  sidebarButtonEnabled: false,
  keyboardShortcutEnabled: false,
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

function unsupportedPageConfig(): ExtensionPageConfig {
  return {
    platform: "unsupported",
    pageType: "unsupported",
    matchedRuleId: "unsupported",
    sidebar: SIDEBAR_DISABLED,
    automationActions: [],
  };
}

function unmatchedPageConfig(
  platform: Exclude<ExtensionPagePlatform, "unsupported">,
): ExtensionPageConfig {
  return {
    platform,
    pageType: platform === "github" ? "unsupported" : platform,
    matchedRuleId: `${platform}.unmatched`,
    matchedRuleIds: [],
    sidebar: SIDEBAR_DISABLED,
    automationActions: [],
  };
}

function matchesHost(hostname: string, hostPattern: string): boolean {
  if (hostPattern.startsWith("*.")) {
    const suffix = hostPattern.slice(1);
    return hostname.endsWith(suffix);
  }

  return hostname === hostPattern;
}

function matchPath(
  pathname: string,
  pattern: string,
): { ok: true; params: Record<string, string> } | { ok: false } {
  const pathSegments = pathname.split("/").filter(Boolean);
  const patternSegments = pattern.split("/").filter(Boolean);

  if (pathSegments.length !== patternSegments.length) {
    return { ok: false };
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathSegment = pathSegments[index];

    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = pathSegment;
      continue;
    }

    if (patternSegment !== pathSegment) {
      return { ok: false };
    }
  }

  return { ok: true, params };
}

function matchesParamRule(actual: string | undefined, expected: string | string[]): boolean {
  const expectations = Array.isArray(expected) ? expected : [expected];

  return expectations.every((value) => {
    if (value.startsWith("!")) {
      return actual !== value.slice(1);
    }

    return actual === value;
  });
}

function matchesRule(url: URL, rule: ActionPageRule): boolean {
  const hostPatterns = Array.isArray(rule.host) ? rule.host : [rule.host];
  if (!hostPatterns.some((host) => matchesHost(url.hostname, host))) {
    return false;
  }

  const pathMatch = matchPath(url.pathname, rule.path);
  if (!pathMatch.ok) {
    return false;
  }

  for (const [key, expected] of Object.entries(rule.params ?? {})) {
    if (!matchesParamRule(pathMatch.params[key], expected)) {
      return false;
    }
  }

  for (const [key, expected] of Object.entries(rule.query ?? {})) {
    if (url.searchParams.get(key) !== expected) {
      return false;
    }
  }

  return true;
}

function resolveActionPageConfig(
  url: URL,
  platform: Exclude<ExtensionPagePlatform, "unsupported">,
): ExtensionPageConfig {
  const matchedRules = ACTION_PAGE_RULES.filter((rule) =>
    rule.platform === platform && matchesRule(url, rule)
  );

  if (matchedRules.length === 0) {
    return unmatchedPageConfig(platform);
  }

  const actionIds = new Set<AutomationActionId>();
  for (const rule of matchedRules) {
    for (const actionId of rule.actions) {
      actionIds.add(actionId);
    }
  }

  const primaryRule = matchedRules[0];

  return {
    platform,
    pageType: primaryRule.pageType,
    matchedRuleId: primaryRule.id,
    matchedRuleIds: matchedRules.map((rule) => rule.id),
    sidebar: primaryRule.sidebar,
    automationActions: [...actionIds].map((actionId) => AUTOMATION_ACTIONS[actionId]),
  };
}

function logPageConfigResolved(url: URL | null, pageConfig: ExtensionPageConfig): void {
  logger.info(
    {
      event: "PAGE_CONFIG_RESOLVED",
      module: "public-config",
      urlHost: url?.hostname,
      urlPath: url?.pathname,
      platform: pageConfig.platform,
      pageType: pageConfig.pageType,
      matchedRuleId: pageConfig.matchedRuleId,
      matchedRuleIds: pageConfig.matchedRuleIds ?? [],
      actionKeys: pageConfig.automationActions.map((action) => action.key),
      sidebarButtonEnabled: pageConfig.sidebar.sidebarButtonEnabled,
      injectPageElements: pageConfig.sidebar.injectPageElements,
    },
    "Resolved extension page config",
  );
}

export async function getExtensionPageConfigController(input: {
  url?: string;
}): Promise<ExtensionPageConfigResponse> {
  const url = getUrl(input.url);

  if (!url) {
    const pageConfig = unsupportedPageConfig();
    logPageConfigResolved(null, pageConfig);
    return {
      ok: true,
      data: {
        pageConfig,
      },
    };
  }

  if (isLarkHost(url.hostname)) {
    const pageConfig = resolveActionPageConfig(url, "lark");
    logPageConfigResolved(url, pageConfig);
    return {
      ok: true,
      data: {
        pageConfig,
      },
    };
  }

  if (isMeegleHost(url.hostname)) {
    const pageConfig = resolveActionPageConfig(url, "meegle");
    logPageConfigResolved(url, pageConfig);
    return {
      ok: true,
      data: {
        pageConfig,
      },
    };
  }

  if (isGitHubHost(url.hostname)) {
    const pageConfig = resolveActionPageConfig(url, "github");
    logPageConfigResolved(url, pageConfig);
    return {
      ok: true,
      data: {
        pageConfig,
      },
    };
  }

  const pageConfig = unsupportedPageConfig();
  logPageConfigResolved(url, pageConfig);
  return {
    ok: true,
    data: {
      pageConfig,
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
            { method: "POST", path: "/api/meegle/workitem/story-prd-to-simplified", description: "Story Summary 生成简化需求确认并覆盖写入 Tech Summary" },
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
