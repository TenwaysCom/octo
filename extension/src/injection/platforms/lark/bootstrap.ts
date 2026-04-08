import { createProbeOverlay, type ProbeOverlayHandle, type ProbeOverlayState } from "../../core/overlay";
import { createProbeController, isInjectionProbeEnabled, type ProbeController } from "../../core/probe-controller";
import { createLarkInjectionAdapter } from "./adapter";
import { probeLarkContext, probeLarkDetail, type LarkRecordContext } from "./probe";
import type { InjectionPageState } from "../../types";
import type { LarkPageContext } from "../../../types/lark";

export type LarkDetectedPageContext = LarkPageContext & {
  detectedLarkId?: string;
};

export type LarkContentScriptRuntime = {
  detectLarkPageContext: () => LarkDetectedPageContext | null;
  extractAuthCodeFromRedirect: () => { code: string; state: string } | null;
  getLarkUserId: () => string | null;
  initLarkContentScript: () => void;
  refreshProbeState: () => void;
  getProbeState: () => ProbeOverlayState;
};

function toProbeOverlayState(pageState: InjectionPageState<LarkRecordContext>): ProbeOverlayState {
  if (pageState.kind === "detail-ready") {
    return {
      detailState: "detail-ready",
      detailTitle: pageState.context.title,
      anchorLabel: pageState.anchor.label,
    };
  }

  if (pageState.kind === "detail-loading") {
    return {
      detailState: "detail-loading",
      detailTitle: null,
      anchorLabel: null,
    };
  }

  return {
    detailState: "closed",
    detailTitle: null,
    anchorLabel: null,
  };
}

function inferPageTypeFromRecordContext(context: LarkRecordContext | null): LarkPageContext["pageType"] {
  if (!context) {
    return "unknown";
  }

  const labels = context.fields.map((field) => field.label.trim().toLowerCase());
  const hasA2Signal = labels.some((label) =>
    label.includes("acceptance")
    || label.includes("验收")
    || label.includes("target")
    || label.includes("目标"),
  );
  if (hasA2Signal) {
    return "lark_a2";
  }

  const hasA1Signal = labels.some((label) =>
    label.includes("impact")
    || label.includes("environment")
    || label.includes("request status")
    || label.includes("priority")
    || label.includes("影响")
    || label.includes("环境"),
  );
  if (hasA1Signal) {
    return "lark_a1";
  }

  return "unknown";
}

export function createLarkContentScriptRuntime(): LarkContentScriptRuntime {
  let probeState: ProbeOverlayState = {
    detailState: "closed",
    detailTitle: null,
    anchorLabel: null,
  };
  let probeOverlay: ProbeOverlayHandle | null = null;
  let probeController: ProbeController<LarkRecordContext> | null = null;
  let runtimeInitialized = false;
  let probeModeInitialized = false;
  let messageListenerInitialized = false;

  function refreshProbeState(): void {
    probeController?.refresh();
  }

  function handlePageState(pageState: InjectionPageState<LarkRecordContext>): void {
    probeState = toProbeOverlayState(pageState);
    probeOverlay?.render(probeState);
  }

  function readPageContext(): LarkDetectedPageContext | null {
    const url = window.location.href;
    const detail = probeLarkDetail();
    const parsedContext = detail.detailRoot ? probeLarkContext(detail.detailRoot) : null;

    const context: LarkDetectedPageContext = {
      pageType: inferPageTypeFromRecordContext(parsedContext),
      url,
    };

    const urlMatch = url.match(/\/base\/([^/]+)\/table\/([^/]+)\/record\/([^/]+)/);
    if (urlMatch) {
      context.baseId = urlMatch[1];
      context.tableId = urlMatch[2];
      context.recordId = urlMatch[3];
    }

    const larkIdElement = document.querySelector('[data-user-id]') as HTMLElement;
    if (larkIdElement) {
      context.detectedLarkId = larkIdElement.dataset.userId;
    }

    return context;
  }

  function resolveLarkActionContext(): LarkPageContext | null {
    const pageContext = readPageContext();
    if (!pageContext) {
      return null;
    }

    return {
      ...pageContext,
      operatorLarkId: getLarkUserId() ?? undefined,
    };
  }

  function initInjectionRuntime(): void {
    if (runtimeInitialized) {
      return;
    }

    runtimeInitialized = true;
    probeController = createProbeController({
      adapter: createLarkInjectionAdapter({
        getPageContext: resolveLarkActionContext,
        onPageState: handlePageState,
      }),
    });
    probeController.refresh();
  }

  function initProbeMode(): void {
    if (probeModeInitialized || !isInjectionProbeEnabled()) {
      return;
    }

    probeModeInitialized = true;
    probeOverlay = createProbeOverlay(refreshProbeState);
    probeOverlay.render(probeState);
  }

  function getLarkUserId(): string | null {
    const selectors = [
      "[data-user-id]",
      "[data-user_id]",
      ".user-id",
      "[id*='user']",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) {
        if (element.dataset.userId) {
          return element.dataset.userId;
        }

        const id = element.innerText?.trim();
        if (id && id.length > 5) {
          return id;
        }
      }
    }

    // @ts-ignore - Check for Lark global objects
    if (window.Lark?.user?.id) {
      // @ts-ignore
      return window.Lark.user.id;
    }

    return null;
  }

  function extractAuthCodeFromRedirect(): { code: string; state: string } | null {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (code && state) {
      return { code, state };
    }

    return null;
  }

  function initLarkContentScript(): void {
    console.log("[Tenways Octo] Lark content script initialized");

    initInjectionRuntime();
    initProbeMode();

    if (messageListenerInitialized) {
      return;
    }

    messageListenerInitialized = true;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === "getPageContext") {
        sendResponse(readPageContext());
      }

      if (message.action === "getLarkAuthCode") {
        sendResponse(extractAuthCodeFromRedirect());
      }

      if (message.action === "getLarkUserId") {
        sendResponse({ userId: getLarkUserId() });
      }
    });
  }

  return {
    detectLarkPageContext: readPageContext,
    extractAuthCodeFromRedirect,
    getLarkUserId,
    initLarkContentScript,
    refreshProbeState,
    getProbeState: () => probeState,
  };
}
