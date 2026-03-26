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
        deps.setStatus("ready", auth.authCode || "已授权");
        deps.log.success("Meegle 已授权");
        return true;
      }

      if (auth.reason === "MEEGLE_PAGE_REQUIRED") {
        deps.log.warn("请先打开并登录 Meegle 页面后再授权");
        return false;
      }

      if (auth.reason === "MEEGLE_USER_KEY_REQUIRED") {
        deps.log.error("未能从当前页面识别 Meegle 用户，请刷新页面后重试");
        return false;
      }

      if (auth.reason === "PLUGIN_ID_NOT_CONFIGURED") {
        deps.log.error("插件 ID 未配置");
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
