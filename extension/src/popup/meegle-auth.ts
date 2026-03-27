import type {
  MeegleAuthEnsureRequest,
  MeegleAuthEnsureResponse,
} from "../types/meegle.js";

type PopupPageType = "meegle" | "lark" | "unsupported" | null;

export interface BuildMeegleAuthRequestInput {
  currentTabId?: number;
  currentTabOrigin?: string;
  currentPageType: PopupPageType;
  larkId?: string | null;
  meegleUserKey?: string;
}

export interface PopupMeegleAuthLog {
  add(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface CreateMeegleAuthControllerDeps {
  getExistingStatus?: () => Promise<MeegleAuthEnsureResponse | undefined>;
  sendMessage: (request: MeegleAuthEnsureRequest) => Promise<MeegleAuthEnsureResponse>;
  setStatus: (status: string, text: string) => void;
  log: PopupMeegleAuthLog;
}

export interface MeegleStatusDisplay {
  status: "ready" | "pending" | "error";
  text: string;
}

function formatExpiry(expiresAt?: string): string | undefined {
  if (!expiresAt) {
    return undefined;
  }

  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const hours = `${parsed.getHours()}`.padStart(2, "0");
  const minutes = `${parsed.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

export function resolveMeegleStatusDisplay(
  auth?: Pick<MeegleAuthEnsureResponse, "status" | "credentialStatus" | "expiresAt">,
  meegleUserKey?: string,
): MeegleStatusDisplay {
  if (auth?.status === "ready") {
    const expiryText = formatExpiry(auth.expiresAt);
    return {
      status: "ready",
      text: expiryText ? `已授权 · ${expiryText}` : "已授权",
    };
  }

  if (auth?.status === "failed") {
    return {
      status: "error",
      text: "授权异常",
    };
  }

  if (auth?.status === "require_auth_code") {
    return {
      status: "pending",
      text: "待授权",
    };
  }

  return {
    status: "pending",
    text: meegleUserKey || "-",
  };
}

export function buildMeegleAuthRequest(
  input: BuildMeegleAuthRequestInput,
): MeegleAuthEnsureRequest {
  return {
    requestId: `req_${Date.now()}`,
    operatorLarkId: input.larkId || "ou_user",
    meegleUserKey: input.meegleUserKey,
    baseUrl: input.currentTabOrigin || "https://project.larksuite.com",
    currentTabId: input.currentTabId,
    currentPageIsMeegle: input.currentPageType === "meegle",
  };
}

export function createMeegleAuthController(
  deps: CreateMeegleAuthControllerDeps,
) {
  let lastAuth: MeegleAuthEnsureResponse | undefined;

  return {
    getLastAuth(): MeegleAuthEnsureResponse | undefined {
      return lastAuth;
    },
    async run(input: BuildMeegleAuthRequestInput): Promise<boolean> {
      try {
        const existingStatus = await deps.getExistingStatus?.();
        if (existingStatus?.status === "ready") {
          lastAuth = existingStatus;
          const display = resolveMeegleStatusDisplay(existingStatus, input.meegleUserKey);
          deps.setStatus(display.status, display.text);
          deps.log.success("Meegle 已授权，沿用服务端 token");
          return true;
        }
      } catch {
        deps.log.warn("查询现有 Meegle 授权状态失败，继续尝试重新授权");
      }

      deps.log.add("检查 Meegle 授权...");
      const auth = await deps.sendMessage(buildMeegleAuthRequest(input));
      lastAuth = auth;

      if (auth.status === "ready") {
        const display = resolveMeegleStatusDisplay(auth, input.meegleUserKey);
        deps.setStatus(display.status, display.text);
        deps.log.success("Meegle 已授权，服务端 token 已就绪");
        return true;
      }

      if (auth.reason === "MEEGLE_PAGE_REQUIRED") {
        deps.log.warn(auth.errorMessage || "请先打开并登录 Meegle 页面后再授权");
        return false;
      }

      if (auth.reason === "MEEGLE_USER_KEY_REQUIRED") {
        if (auth.credentialStatus === "auth_code_received" && auth.authCode) {
          deps.log.error("已拿到 auth code，但还没完成服务端 token 兑换：缺少 Meegle User Key");
          return false;
        }

        deps.log.error("未能从当前页面识别 Meegle 用户，请刷新页面后重试");
        return false;
      }

      if (auth.reason === "AUTH_CODE_REQUEST_FAILED") {
        deps.log.error(`获取授权码失败: ${auth.errorMessage || "未知错误"}`);
        return false;
      }

      if (auth.reason?.includes("EXCHANGE")) {
        deps.log.error(`服务端 token 兑换失败: ${auth.errorMessage || auth.reason}`);
        return false;
      }

      if (auth.reason === "PLUGIN_ID_NOT_CONFIGURED") {
        deps.log.error("插件 ID 未配置，请先在设置里填写 MEEGLE_PLUGIN_ID");
        return false;
      }

      if (auth.reason === "MEEGLE_AUTH_REQUIRED_FIELDS_MISSING") {
        deps.log.error("缺少授权所需的基础身份信息");
        return false;
      }

      deps.log.warn(`需要登录 Meegle (${auth.reason || auth.status})`);
      deps.log.warn("请在 Meegle 页面登录后重试");
      return false;
    },
  };
}
