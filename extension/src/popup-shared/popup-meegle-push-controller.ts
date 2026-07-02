import type { PopupLogLevel, PopupNotebookPage } from "../popup/types.js";
import { runMeegleLarkPushRequest, type PopupTabContext } from "../popup/runtime.js";
import { collectActionRuntimeContext } from "./action-runtime-context.js";

type PopupStoreSnapshot = {
  state: {
    currentUrl: string | null;
    currentTabId: number | null;
    currentTabOrigin: string | null;
    pageType?: "meegle" | "lark" | "github" | "unsupported";
    identity: {
      masterUserId: string | null;
    };
  };
};

interface MeeglePushRunOptions {
  endpoint?: string;
  logLabel?: string;
  successPrefix?: string;
  actionRunId?: string;
}

interface CreateMeeglePushControllerDeps {
  readStore: () => PopupStoreSnapshot;
  appendLog: (level: PopupLogLevel, message: string) => void;
  showToast: (text: string, level?: PopupLogLevel) => void;
  setActivePage: (page: PopupNotebookPage) => void;
  queryCurrentTabContext?: () => Promise<PopupTabContext>;
  updateCurrentTabUrl: (tabId: number, url: string) => void;
}

function resolveServerErrorMessage(error: unknown): string {
  if (!error) {
    return "未知错误";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && !Array.isArray(error)) {
    const record = error as Record<string, unknown>;
    return typeof record.errorMessage === "string"
      ? record.errorMessage
      : typeof record.message === "string"
        ? record.message
        : "未知错误";
  }
  return String(error);
}

export function createMeeglePushController(deps: CreateMeeglePushControllerDeps) {
  const {
    readStore,
    appendLog,
    showToast,
    setActivePage,
    queryCurrentTabContext,
    updateCurrentTabUrl,
  } = deps;

  async function run(options: MeeglePushRunOptions = {}): Promise<void> {
    const logLabel = options.logLabel ?? "更新Lark及推送";
    const successPrefix = options.successPrefix ?? "推送完成";
    const actionRunId = options.actionRunId;

    appendLog("info", `[${logLabel}] 开始执行${actionRunId ? ` · actionRunId=${actionRunId}` : ""}`);

    const current = readStore();
    const currentTab = {
      id: current.state.currentTabId,
      url: current.state.currentUrl,
      origin: current.state.currentTabOrigin,
      pageType: current.state.pageType ?? "meegle",
    };

    if (queryCurrentTabContext) {
      try {
        const refreshedTab = await queryCurrentTabContext();
        if (refreshedTab?.url || refreshedTab?.origin) {
          currentTab.id = refreshedTab.id ?? currentTab.id;
          currentTab.url = refreshedTab.url ?? currentTab.url;
          currentTab.origin = refreshedTab.origin ?? currentTab.origin;
          currentTab.pageType = refreshedTab.pageType ?? currentTab.pageType;
        }
      } catch {
        appendLog("warn", `[${logLabel}] 刷新当前页面信息失败，继续使用已缓存页面信息`);
      }
    }

    const actionContext = collectActionRuntimeContext({
      actionRunId: actionRunId ?? "",
      currentTab,
      identity: {
        masterUserId: current.state.identity.masterUserId,
      },
    });
    const currentUrl = actionContext.currentTab.url;

    if (!currentUrl) {
      appendLog("error", `当前页面 URL 为空，无法执行${logLabel}`);
      return;
    }

    const meegleContext = actionContext.pageContext.meegle;
    if (!meegleContext) {
      appendLog("error", `无法从 URL 解析工作项信息: ${currentUrl}`);
      return;
    }

    const { projectKey, workItemTypeKey, workItemId, baseUrl } = meegleContext;
    const masterUserId = actionContext.identity.masterUserId;
    if (!masterUserId) {
      appendLog("error", "未解析到主身份，无法执行推送");
      return;
    }

    appendLog(
      "info",
      `[${logLabel}] 准备调用服务端 API: project=${projectKey}, type=${workItemTypeKey}, id=${workItemId}, masterUserId=${masterUserId}${actionRunId ? `, actionRunId=${actionRunId}` : ""}`,
    );

    const result = await runMeegleLarkPushRequest({
      projectKey,
      workItemTypeKey,
      workItemId,
      masterUserId,
      baseUrl,
      actionRunId,
    }, options.endpoint);

    appendLog(
      "info",
      `[${logLabel}] 服务端响应: ok=${result.ok}, alreadyUpdated=${result.alreadyUpdated}, larkBaseUpdated=${result.larkBaseUpdated}, messageSent=${result.messageSent}, reactionAdded=${result.reactionAdded}, meegleStatusUpdated=${result.meegleStatusUpdated}`,
    );

    if (!result.ok) {
      const errorMessage = `推送失败: ${resolveServerErrorMessage(result.error)}`;
      showToast(errorMessage, "error");
      appendLog("warn", `${errorMessage}${actionRunId ? ` · actionRunId=${actionRunId}` : ""}`);
      return;
    }

    if (result.alreadyUpdated) {
      const alreadyMessage = "该工作项已经更新过，无需重复推送";
      showToast(alreadyMessage, "warn");
      appendLog("warn", alreadyMessage);
      return;
    }

    const parts: string[] = [];
    if (result.larkBaseUpdated) {
      parts.push("Lark Base 状态已更新");
    }
    if (result.messageSent) {
      parts.push("Lark 消息已发送");
    }
    if (result.reactionAdded) {
      parts.push("Lark 消息 reaction 已添加");
    }
    if (result.meegleStatusUpdated) {
      parts.push("Meegle 状态已更新");
    }

    const successMessage = `${successPrefix}${parts.length ? `: ${parts.join("、")}` : ""}`;
    showToast(successMessage, "success");
    appendLog("success", successMessage);

    setActivePage("chat");
    if (currentTab.id == null) {
      return;
    }

    try {
      const url = new URL(currentUrl);
      url.searchParams.set("tabKey", "txHFa5L16");
      url.hash = "txHFa5L16";
      updateCurrentTabUrl(currentTab.id, url.toString());
      appendLog("info", `[${logLabel}] 已跳转页面: ${url.toString()}`);
    } catch {
      appendLog("warn", `[${logLabel}] 页面跳转失败`);
    }
  }

  return {
    run,
  };
}
