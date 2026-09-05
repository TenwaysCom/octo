import { useCallback } from "react";
import { approveOctoPluginLogin } from "../services/auth/extension-presence.js";
import {
  completeOctoPluginLogin,
  getWebProfile,
  startOctoPluginLogin,
} from "../services/auth/lark-auth-api.js";

export function getPluginLoginFailureMessage(errorCode) {
  if (errorCode === "LARK_AUTH_REQUIRED") {
    return "插件尚未完成 Lark 授权，请在 Octo 插件中完成 Lark 授权后重试。";
  }
  if (errorCode === "ENVIRONMENT_MISMATCH") {
    return "当前网页与插件所选环境不一致，请切换插件环境后重试。";
  }
  return "无法通过 Octo 插件登录，请确认插件已安装并重试。";
}

export function usePluginLogin({ apiBaseUrl, extensionStatus, setIsBusy, setProfile, setStatus }) {
  return useCallback(async () => {
    if (extensionStatus !== "detected") {
      return;
    }

    setIsBusy(true);
    setStatus({ title: "正在通过插件登录", text: "正在确认插件中的 Lark 授权。" });
    try {
      const challenge = await startOctoPluginLogin({ apiBaseUrl });
      const approval = await approveOctoPluginLogin({ challengeId: challenge.challengeId });
      if (!approval.approved) {
        setStatus({ title: "插件登录未完成", text: getPluginLoginFailureMessage(approval.errorCode) });
        return;
      }

      const completed = await completeOctoPluginLogin({ apiBaseUrl, challengeId: challenge.challengeId });
      if (!completed) {
        setStatus({ title: "插件登录未完成", text: "登录确认已失效，请重新尝试。" });
        return;
      }

      const result = await getWebProfile({ apiBaseUrl });
      if (!result.authenticated) {
        setStatus({ title: "插件登录未完成", text: "工作台会话创建失败，请重新尝试。" });
        return;
      }
      setProfile(result.profile);
      setStatus({ title: "登录成功", text: "正在进入你的 Tenways Octo 工作台。" });
    } catch {
      setStatus({ title: "插件登录未完成", text: "无法连接 Octo 服务，请稍后重试或使用 Lark 登录。" });
    } finally {
      setIsBusy(false);
    }
  }, [apiBaseUrl, extensionStatus, setIsBusy, setProfile, setStatus]);
}
