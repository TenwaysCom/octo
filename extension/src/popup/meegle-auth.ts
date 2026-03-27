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
  sendMessage: (request: MeegleAuthEnsureRequest) => Promise<MeegleAuthEnsureResponse>;
  setStatus: (status: string, text: string) => void;
  log: PopupMeegleAuthLog;
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
      deps.log.add("检查 Meegle 授权...");
      const auth = await deps.sendMessage(buildMeegleAuthRequest(input));
      lastAuth = auth;

      if (auth.status === "ready") {
        deps.setStatus("ready", "已授权");
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
