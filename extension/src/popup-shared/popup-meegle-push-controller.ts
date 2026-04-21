import type { PopupLogLevel, PopupNotebookPage } from "../popup/types.js";
import { runMeegleLarkPushRequest } from "../popup/runtime.js";

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

interface CreateMeeglePushControllerDeps {
  readStore: () => PopupStoreSnapshot;
  appendLog: (level: PopupLogLevel, message: string) => void;
  showToast: (text: string, level?: PopupLogLevel) => void;
  setActivePage: (page: PopupNotebookPage) => void;
  updateCurrentTabUrl: (tabId: number, url: string) => void;
}

export function createMeeglePushController(deps: CreateMeeglePushControllerDeps) {
  const { readStore, appendLog, showToast, setActivePage, updateCurrentTabUrl } = deps;

  async function run(): Promise<void> {
    appendLog("info", "[更新Lark及推送] 开始执行");

    const current = readStore();
    const currentUrl = current.state.currentUrl;

    if (!currentUrl) {
      appendLog("error", "当前页面 URL 为空，无法执行推送");
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(currentUrl).pathname;
      appendLog("info", `[更新Lark及推送] 解析 URL pathname: ${pathname}`);
    } catch {
      appendLog("error", "当前页面 URL 解析失败");
      return;
    }

    const pathParts = pathname.split("/").filter(Boolean);
    appendLog("info", `[更新Lark及推送] 路径片段: ${pathParts.join(", ")}`);
    if (pathParts.length < 4 || pathParts[2] !== "detail") {
      appendLog("error", `无法从 URL 解析工作项信息: ${pathname}`);
      return;
    }

    const [projectKey, workItemTypeKey, , workItemId] = pathParts;
    const masterUserId = current.state.identity.masterUserId;
    if (!masterUserId) {
      appendLog("error", "未解析到主身份，无法执行推送");
      return;
    }

    const baseUrl = current.state.currentTabOrigin || "https://project.larksuite.com";
    appendLog(
      "info",
      `[更新Lark及推送] 准备调用服务端 API: project=${projectKey}, type=${workItemTypeKey}, id=${workItemId}, masterUserId=${masterUserId}`,
    );

    const result = await runMeegleLarkPushRequest({
      projectKey,
      workItemTypeKey,
      workItemId,
      masterUserId,
      baseUrl,
    });

    appendLog(
      "info",
      `[更新Lark及推送] 服务端响应: ok=${result.ok}, alreadyUpdated=${result.alreadyUpdated}, larkBaseUpdated=${result.larkBaseUpdated}, messageSent=${result.messageSent}, reactionAdded=${result.reactionAdded}, meegleStatusUpdated=${result.meegleStatusUpdated}`,
    );

    if (!result.ok) {
      const errorMessage = `推送失败: ${result.error || "未知错误"}`;
      showToast(errorMessage, "error");
      appendLog("warn", errorMessage);
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

    const successMessage = `推送完成${parts.length ? `: ${parts.join("、")}` : ""}`;
    showToast(successMessage, "success");
    appendLog("success", successMessage);

    setActivePage("chat");
    if (current.state.currentTabId == null) {
      return;
    }

    try {
      const url = new URL(currentUrl);
      url.searchParams.set("tabKey", "txHFa5L16");
      url.hash = "txHFa5L16";
      updateCurrentTabUrl(current.state.currentTabId, url.toString());
      appendLog("info", `[更新Lark及推送] 已跳转页面: ${url.toString()}`);
    } catch {
      appendLog("warn", "[更新Lark及推送] 页面跳转失败");
    }
  }

  return {
    run,
  };
}
