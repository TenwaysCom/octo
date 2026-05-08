import { getConfig } from "../background/config.js";
import { fetchServerJson } from "../server-request.js";
import type { PopupLogLevel } from "../popup/types.js";
import type {
  GitHubBranchPreviewResponse,
  GitHubBranchCreateResponse,
} from "../types/meegle.js";

type PopupStoreSnapshot = {
  state: {
    currentUrl: string | null;
    currentTabId: number | null;
    currentTabOrigin: string | null;
    identity: {
      masterUserId: string | null;
    };
  };
};

export interface GitHubBranchCreateModalState {
  visible: boolean;
  stage: "preview" | "creating" | "success" | "error";
  repo: string;
  defaultBranchName: string;
  editedBranchName: string;
  workItemTitle: string;
  systemLabel: string;
  error: { errorCode: string; errorMessage: string } | null;
  result: { branchName: string; branchUrl: string } | null;
}

interface CreateGitHubBranchCreateControllerDeps {
  readStore: () => PopupStoreSnapshot;
  queryCurrentTabContext: () => Promise<{
    id: number | null;
    url: string | null;
    origin: string | null;
    pageType: "meegle" | "lark" | "github" | "unsupported";
  }>;
  updateCurrentTabContext: (input: {
    id: number | null;
    url: string | null;
    origin: string | null;
  }) => void;
  appendLog: (level: PopupLogLevel, message: string) => void;
  showToast: (text: string, level?: PopupLogLevel) => void;
  setModalState: (
    next: GitHubBranchCreateModalState | ((previous: GitHubBranchCreateModalState) => GitHubBranchCreateModalState),
  ) => void;
}

const ERROR_CODE_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "请求无效，请检查参数",
  PREVIEW_FAILED: "获取分支预览信息失败",
  CREATE_FAILED: "创建分支失败",
  GITHUB_NOT_CONFIGURED: "服务器未配置 GITHUB_TOKEN",
  UNKNOWN_ERROR: "未知错误",
};

function resolveErrorMessage(errorCode: string, serverMessage?: string): string {
  return ERROR_CODE_MESSAGES[errorCode] || serverMessage || `错误: ${errorCode}`;
}

export function createGitHubBranchCreateController(deps: CreateGitHubBranchCreateControllerDeps) {
  const {
    readStore,
    queryCurrentTabContext,
    updateCurrentTabContext,
    appendLog,
    showToast,
    setModalState,
  } = deps;

  function resetModal(): void {
    setModalState({
      visible: false,
      stage: "preview",
      repo: "",
      defaultBranchName: "",
      editedBranchName: "",
      workItemTitle: "",
      systemLabel: "",
      error: null,
      result: null,
    });
  }

  async function open(): Promise<void> {
    appendLog("info", "[创建 GitHub 分支] 开始获取预览信息...");

    const tabContext = await queryCurrentTabContext();
    updateCurrentTabContext({
      id: tabContext.id,
      url: tabContext.url,
      origin: tabContext.origin,
    });
    const current = readStore();
    const currentUrl = tabContext.url ?? current.state.currentUrl;

    if (!currentUrl) {
      appendLog("error", "当前页面 URL 为空");
      showToast("当前页面 URL 为空", "error");
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(currentUrl).pathname;
    } catch {
      appendLog("error", "当前页面 URL 解析失败");
      showToast("URL 解析失败", "error");
      return;
    }

    const pathParts = pathname.split("/").filter(Boolean);
    if (pathParts.length < 4 || pathParts[2] !== "detail") {
      appendLog("error", `无法从 URL 解析工作项信息: ${pathname}`);
      showToast("无法解析工作项信息", "error");
      return;
    }

    const [projectKey, workItemTypeKey, , workItemId] = pathParts;
    const masterUserId = current.state.identity.masterUserId;
    if (!masterUserId) {
      appendLog("error", "未解析到主身份");
      showToast("未解析到主身份", "error");
      return;
    }

    const baseUrl = current.state.currentTabOrigin || "https://project.larksuite.com";

    try {
      const config = await getConfig();
      const { response, payload: data } = await fetchServerJson<{
        ok: boolean;
        repo?: string;
        defaultBranchName?: string;
        workItemTitle?: string;
        systemValue?: string;
        systemLabel?: string;
        error?: { errorCode: string; errorMessage: string };
      }>({
        url: `${config.SERVER_URL}/api/github/branch/preview`,
        masterUserId,
        body: {
          projectKey,
          workItemTypeKey,
          workItemId,
          masterUserId,
          baseUrl,
        },
      });

      if (!response.ok || !data.ok) {
        const errorCode = data.error?.errorCode || "UNKNOWN_ERROR";
        const errorMessage = resolveErrorMessage(errorCode, data.error?.errorMessage);
        appendLog("error", `获取预览失败: ${errorMessage}`);
        showToast(errorMessage, "error");
        return;
      }

      const preview = data as unknown as GitHubBranchPreviewResponse;
      setModalState({
        visible: true,
        stage: "preview",
        repo: preview.repo,
        defaultBranchName: preview.defaultBranchName,
        editedBranchName: preview.defaultBranchName,
        workItemTitle: preview.workItemTitle,
        systemLabel: preview.systemLabel,
        error: null,
        result: null,
      });

      appendLog(
        "info",
        `预览: repo=${preview.repo}, branch=${preview.defaultBranchName}, system=${preview.systemLabel}`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      appendLog("error", `请求异常: ${errorMessage}`);
      showToast("请求失败，请检查网络", "error");
    }
  }

  async function confirmCreate(): Promise<void> {
    const tabContext = await queryCurrentTabContext();
    updateCurrentTabContext({
      id: tabContext.id,
      url: tabContext.url,
      origin: tabContext.origin,
    });
    const current = readStore();
    const currentUrl = tabContext.url ?? current.state.currentUrl;
    if (!currentUrl) {
      appendLog("error", "当前页面 URL 为空");
      showToast("当前页面 URL 为空", "error");
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(currentUrl).pathname;
    } catch {
      appendLog("error", "URL 解析失败");
      showToast("URL 解析失败", "error");
      return;
    }

    const pathParts = pathname.split("/").filter(Boolean);
    if (pathParts.length < 4 || pathParts[2] !== "detail") {
      appendLog("error", "无法解析工作项信息");
      showToast("请进入对应的需求界面再点击", "error");
      return;
    }

    const [projectKey, workItemTypeKey, , workItemId] = pathParts;
    const masterUserId = current.state.identity.masterUserId;
    if (!masterUserId) {
      appendLog("error", "未解析到主身份");
      showToast("未解析到主身份", "error");
      return;
    }

    const baseUrl = current.state.currentTabOrigin || "https://project.larksuite.com";

    // Read the current edited branch name from store via a callback pattern
    // We need to capture it before we transition to creating state
    let branchName = "";
    setModalState((prev) => {
      branchName = prev.editedBranchName;
      return { ...prev, stage: "creating", error: null };
    });

    if (!branchName) {
      appendLog("error", "分支名称为空");
      showToast("分支名称不能为空", "error");
      setModalState((prev) => ({ ...prev, stage: "preview" }));
      return;
    }

    try {
      const config = await getConfig();
      const { response, payload: data } = await fetchServerJson<{
        ok: boolean;
        repo?: string;
        branchName?: string;
        branchUrl?: string;
        error?: { errorCode: string; errorMessage: string };
      }>({
        url: `${config.SERVER_URL}/api/github/branch/create`,
        masterUserId,
        body: {
          projectKey,
          workItemTypeKey,
          workItemId,
          masterUserId,
          baseUrl,
          branchName,
        },
      });

      if (!response.ok || !data.ok) {
        const errorCode = data.error?.errorCode || "UNKNOWN_ERROR";
        const errorMessage = resolveErrorMessage(errorCode, data.error?.errorMessage);
        appendLog("error", `创建失败: ${errorMessage}`);
        setModalState((prev) => ({
          ...prev,
          stage: "error",
          error: { errorCode, errorMessage },
        }));
        showToast(errorMessage, "error");
        return;
      }

      const result = data as unknown as GitHubBranchCreateResponse;
      setModalState((prev) => ({
        ...prev,
        stage: "success",
        result: {
          branchName: result.branchName,
          branchUrl: result.branchUrl,
        },
      }));

      appendLog("success", `分支创建成功: ${result.branchName}`);
      showToast(`分支 ${result.branchName} 创建成功`, "success");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      appendLog("error", `创建异常: ${errorMessage}`);
      setModalState((prev) => ({
        ...prev,
        stage: "error",
        error: { errorCode: "REQUEST_FAILED", errorMessage: `请求失败: ${errorMessage}` },
      }));
      showToast("创建失败，请检查网络", "error");
    }
  }

  return {
    open,
    confirmCreate,
    resetModal,
  };
}
