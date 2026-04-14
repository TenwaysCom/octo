import { createProbeOverlay, type ProbeOverlayHandle, type ProbeOverlayState, type ProbeDebugInfo } from "../../core/overlay";
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

function readFirstSearchParam(
  params: URLSearchParams[],
  keys: string[],
): string | undefined {
  for (const key of keys) {
    for (const set of params) {
      const value = set.get(key)?.trim();
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function parseLarkUrlContext(url: URL): Pick<LarkDetectedPageContext, "baseId" | "tableId" | "recordId"> {
  const routeCandidates = [url.pathname];
  const normalizedHash = decodeURIComponent(url.hash.replace(/^#/, ""));
  if (normalizedHash) {
    routeCandidates.push(normalizedHash);
  }

  let baseId: string | undefined;
  let tableId: string | undefined;
  let recordId: string | undefined;

  for (const candidate of routeCandidates) {
    const routeMatch = candidate.match(
      /\/base\/([^/?#]+)(?:\/table\/([^/?#]+))?(?:\/record\/([^/?#]+))?/,
    );
    if (!routeMatch) {
      continue;
    }

    baseId = routeMatch[1];
    tableId = routeMatch[2] || tableId;
    recordId = routeMatch[3] || recordId;
    break;
  }

  const hashQueryIndex = normalizedHash.indexOf("?");
  const params = [
    url.searchParams,
    new URLSearchParams(
      hashQueryIndex >= 0 ? normalizedHash.slice(hashQueryIndex + 1) : "",
    ),
  ];

  return {
    baseId: baseId ?? readFirstSearchParam(params, ["baseId", "appId", "app", "base"]),
    tableId: tableId ?? readFirstSearchParam(params, ["tableId", "table", "tbl"]),
    recordId: recordId ?? readFirstSearchParam(params, ["recordId", "record", "record_id"]),
  };
}

function extractRecordIdFromFields(context: LarkRecordContext | null): string | undefined {
  if (!context) {
    return undefined;
  }
  const recordIdField = context.fields.find(
    (field) => field.label.trim().replace(/\s/g, "") === "记录ID",
  );
  return recordIdField?.value.trim();
}

function extractRecordIdFromDom(
  detailRoot: Element | null,
  debugResults?: Array<{ selector: string; label: string | null; value: string | null }>,
): string | undefined {
  if (!detailRoot) {
    return undefined;
  }

  const fieldSelectors = [
    ".field-row",
    "[data-field-row]",
    "[class*='field-row']",
    "[class*='field-item']",
    "[class*='field']",
  ];

  for (const selector of fieldSelectors) {
    const fields = detailRoot.querySelectorAll(selector);

    for (const field of Array.from(fields)) {
      const labelEl = field.querySelector("label, [class*='label'], [data-label]");
      const label = labelEl?.textContent?.trim() ?? null;
      const valueEl = field.querySelector("[class*='value'], [data-value], div:last-child");
      const value = valueEl?.textContent?.trim()
        || field.textContent?.replace(label ?? "", "").trim()
        || null;

      if (debugResults) {
        debugResults.push({ selector, label, value });
      }

      if (label?.replace(/\s/g, "") === "记录ID") {
        if (value?.startsWith("rec")) {
          return value;
        }
      }
    }
  }

  return undefined;
}

function buildDebugInfo(
  detail: ReturnType<typeof probeLarkDetail>,
  parsedContext: LarkRecordContext | null,
  url: string,
): ProbeDebugInfo {
  const domScanResults: Array<{ selector: string; label: string | null; value: string | null }> = [];
  extractRecordIdFromDom(detail.detailRoot, domScanResults);

  const urlRecordId = typeof URL !== "undefined" && url
    ? parseLarkUrlContext(new URL(url)).recordId ?? null
    : null;

  return {
    isDetailOpen: detail.isOpen,
    hasDetailRoot: !!detail.detailRoot,
    parsedFieldCount: parsedContext?.fields.length ?? 0,
    parsedFields: parsedContext?.fields.map(f => ({ label: f.label, value: f.value })) ?? [],
    domScanResults: domScanResults.slice(0, 10),
    urlRecordId,
    fieldExtractRecordId: extractRecordIdFromFields(parsedContext) ?? null,
    domExtractRecordId: extractRecordIdFromDom(detail.detailRoot) ?? null,
  };
}

function toProbeOverlayState(
  pageState: InjectionPageState<LarkRecordContext>,
  recordId: string | null,
  debug?: ProbeDebugInfo,
): ProbeOverlayState {
  if (pageState.kind === "detail-ready") {
    return {
      detailState: "detail-ready",
      detailTitle: pageState.context.title,
      anchorLabel: pageState.anchor.label,
      recordId,
      debug,
    };
  }

  if (pageState.kind === "detail-loading") {
    return {
      detailState: "detail-loading",
      detailTitle: null,
      anchorLabel: null,
      recordId,
      debug,
    };
  }

  return {
    detailState: "closed",
    detailTitle: null,
    anchorLabel: null,
    recordId,
    debug,
  };
}

function inferPageTypeFromRecordContext(
  _context: LarkRecordContext | null,
  baseId: string | undefined,
  tableId: string | undefined,
): LarkPageContext["pageType"] {
  if (baseId && tableId) {
    return "lark_base";
  }

  return "unknown";
}

function readCurrentRouteRecordId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseLarkUrlContext(new URL(window.location.href)).recordId ?? null;
}

export function createLarkContentScriptRuntime(): LarkContentScriptRuntime {
  let probeState: ProbeOverlayState = {
    detailState: "closed",
    detailTitle: null,
    anchorLabel: null,
    recordId: null,
  };
  let probeOverlay: ProbeOverlayHandle | null = null;
  let probeController: ProbeController<LarkRecordContext> | null = null;
  let runtimeInitialized = false;
  let probeModeInitialized = false;
  let messageListenerInitialized = false;

  function refreshProbeState(): void {
    probeController?.refresh();
  }

  function resolveRecordId(
    detail: ReturnType<typeof probeLarkDetail>,
    parsedContext: LarkRecordContext | null,
  ): string | null {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const routeRecordId = url ? parseLarkUrlContext(new URL(url)).recordId : null;
    return routeRecordId
      ?? extractRecordIdFromFields(parsedContext)
      ?? extractRecordIdFromDom(detail.detailRoot)
      ?? null;
  }

  function handlePageState(state: {
    pageState: InjectionPageState<LarkRecordContext>;
    detail: ReturnType<typeof probeLarkDetail>;
    parsedContext: LarkRecordContext | null;
  }): void {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const debug = buildDebugInfo(state.detail, state.parsedContext, url);
    const finalRecordId = resolveRecordId(state.detail, state.parsedContext);
    probeState = toProbeOverlayState(state.pageState, finalRecordId, debug);
    probeOverlay?.render(probeState);
  }

  function readPageContext(): LarkDetectedPageContext | null {
    const url = window.location.href;
    const detail = probeLarkDetail();
    const parsedContext = detail.detailRoot ? probeLarkContext(detail.detailRoot) : null;
    const parsedUrl = new URL(url);
    const routeContext = parseLarkUrlContext(parsedUrl);

    const context: LarkDetectedPageContext = {
      pageType: inferPageTypeFromRecordContext(parsedContext, routeContext.baseId, routeContext.tableId),
      url,
      baseId: routeContext.baseId,
      tableId: routeContext.tableId,
      recordId: routeContext.recordId
        ?? extractRecordIdFromFields(parsedContext)
        ?? extractRecordIdFromDom(detail.detailRoot),
    };

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
      operatorLarkId: pageContext.detectedLarkId ?? getLarkUserId() ?? undefined,
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
