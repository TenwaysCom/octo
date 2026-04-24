import { getConfig } from "../background/config.js";
import { fetchServerJson } from "../server-request.js";
import type { PopupLogLevel } from "../popup/types.js";

export interface GitHubLookupWorkitem {
  id: string;
  name: string;
  type: string;
  status: string;
  url?: string;
  plannedVersion?: string;
  plannedSprint?: string;
}

export interface GitHubLookupResult {
  prInfo: {
    title: string;
    description: string | null;
    url: string;
  };
  extractedIds: string[];
  workitems: GitHubLookupWorkitem[];
  notFound: string[];
}

export interface GitHubLookupState {
  isLoading: boolean;
  error: { errorCode: string; errorMessage: string } | null;
  result: GitHubLookupResult | null;
}

type PopupStoreSnapshot = {
  state: {
    currentUrl: string | null;
    identity: {
      masterUserId: string | null;
    };
  };
};

interface CreateGitHubLookupControllerDeps {
  readStore: () => PopupStoreSnapshot;
  appendLog: (level: PopupLogLevel, message: string) => void;
  showToast: (text: string, level?: PopupLogLevel) => void;
  setState: (
    next: GitHubLookupState | ((previous: GitHubLookupState) => GitHubLookupState),
  ) => void;
}

const ERROR_CODE_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "请求无效，请检查 PR URL",
  NO_MEEGLE_ID_FOUND: "未在 PR 中找到 Meegle ID",
  GITHUB_API_ERROR: "GitHub API 调用失败",
  MEEGLE_API_ERROR: "Meegle API 调用失败",
  MEEGLE_AUTH_ERROR: "Meegle 认证失败",
  MEEGLE_NOT_FOUND: "未找到对应的 Meegle 工作项",
  MEEGLE_RATE_LIMIT: "Meegle API 请求过于频繁，请稍后再试",
  AUTH_EXPIRED: "Meegle 认证已过期，请重新授权",
  USER_NOT_RESOLVED: "用户身份未解析",
  UNAUTHORIZED: "未授权，请重新登录",
  UNKNOWN_ERROR: "未知错误",
};

function resolveErrorMessage(errorCode: string, serverMessage?: string): string {
  return ERROR_CODE_MESSAGES[errorCode] || serverMessage || `错误: ${errorCode}`;
}

export function createGitHubLookupController(deps: CreateGitHubLookupControllerDeps) {
  const { readStore, appendLog, showToast, setState } = deps;

  async function lookup(): Promise<void> {
    appendLog("info", "开始查询 GitHub PR 关联的 Meegle 工作项...");

    setState({
      isLoading: true,
      error: null,
      result: null,
    });

    const current = readStore();
    const prUrl = current.state.currentUrl;
    const masterUserId = current.state.identity.masterUserId;

    if (!prUrl) {
      const message = "当前页面 URL 为空，无法执行查询";
      appendLog("error", message);
      setState({
        isLoading: false,
        error: { errorCode: "MISSING_PR_URL", errorMessage: message },
        result: null,
      });
      return;
    }

    if (!masterUserId) {
      const message = "未解析到主身份，无法执行查询";
      appendLog("error", message);
      setState({
        isLoading: false,
        error: { errorCode: "MISSING_IDENTITY", errorMessage: message },
        result: null,
      });
      return;
    }

    try {
      const config = await getConfig();
      const { response, payload: data } = await fetchServerJson<{
        success: boolean;
        data?: GitHubLookupResult;
        error?: { code: string; message: string };
      }>({
        url: `${config.SERVER_URL}/api/github/lookup-meegle`,
        masterUserId,
        body: { prUrl },
      });

      if (!response.ok || !data.success) {
        const errorCode = data.error?.code || "UNKNOWN_ERROR";
        const errorMessage = resolveErrorMessage(errorCode, data.error?.message);
        appendLog("error", `查询失败: ${errorMessage}`);
        setState({
          isLoading: false,
          error: { errorCode, errorMessage },
          result: null,
        });
        showToast(errorMessage, "error");
        return;
      }

      const result = data.data!;
      setState({
        isLoading: false,
        error: null,
        result,
      });

      const foundCount = result.workitems.length;
      const notFoundCount = result.notFound.length;
      const extractedCount = result.extractedIds.length;

      const successMessage = `查询完成: 提取到 ${extractedCount} 个 Meegle ID，找到 ${foundCount} 个对应工作项${notFoundCount > 0 ? `，${notFoundCount} 个未找到` : ""}`;
      appendLog("success", successMessage);
      showToast(successMessage, "success");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      appendLog("error", `查询异常: ${errorMessage}`);
      setState({
        isLoading: false,
        error: { errorCode: "REQUEST_FAILED", errorMessage: `请求失败: ${errorMessage}` },
        result: null,
      });
      showToast("查询失败，请检查网络连接", "error");
    }
  }

  return {
    lookup,
  };
}
