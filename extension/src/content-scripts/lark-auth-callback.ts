import type { LarkAuthCallbackResult } from "../types/lark.js";

function readLarkAuthCallbackResult(): LarkAuthCallbackResult | undefined {
  const node = document.querySelector("[data-lark-auth-state]") as HTMLElement | null;
  if (!node) {
    return undefined;
  }

  const state = node.dataset.larkAuthState;
  const status = node.dataset.larkAuthStatus as "ready" | "failed" | undefined;
  const masterUserId = node.dataset.larkAuthMasterUserId || undefined;
  const reason = node.dataset.larkAuthReason || undefined;

  if (!state || !status) {
    return undefined;
  }

  return {
    state,
    status,
    masterUserId,
    reason,
  };
}

function relayLarkAuthCallbackResult(): void {
  const result = readLarkAuthCallbackResult();
  if (!result) {
    return;
  }

  chrome.runtime.sendMessage({
    action: "itdog.lark.auth.callback.detected",
    payload: result,
  });

  const messageNode = document.querySelector("main p");
  if (messageNode) {
    messageNode.textContent = "插件已收到授权结果，可以关闭此页。";
  }
}

relayLarkAuthCallbackResult();

const callbackTestingTarget = globalThis as typeof globalThis & {
  __TENWAYS_LARK_AUTH_CALLBACK_TESTING__?: {
    readLarkAuthCallbackResult: () => LarkAuthCallbackResult | undefined;
    relayLarkAuthCallbackResult: () => void;
  };
};

callbackTestingTarget.__TENWAYS_LARK_AUTH_CALLBACK_TESTING__ = {
  readLarkAuthCallbackResult,
  relayLarkAuthCallbackResult,
};

export {};
