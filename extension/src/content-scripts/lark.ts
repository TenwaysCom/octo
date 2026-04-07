// Lark content script - detects page context and injects page bridge

import { createProbeOverlay, type ProbeOverlayHandle, type ProbeOverlayState } from "../injection/core/overlay";
import { isInjectionProbeEnabled } from "../injection/core/probe-controller";

interface LarkPageContext {
  pageType: 'lark_a1' | 'lark_a2' | 'unknown';
  url: string;
  baseId?: string;
  tableId?: string;
  recordId?: string;
  detectedLarkId?: string;
}

interface TenwaysLarkTestingApi {
  detectLarkPageContext: () => LarkPageContext | null;
  extractAuthCodeFromRedirect: () => { code: string; state: string } | null;
  getLarkUserId: () => string | null;
  initLarkContentScript: () => void;
  refreshProbeState: () => void;
  getProbeState: () => ProbeOverlayState;
}

let probeState: ProbeOverlayState = {
  detailState: "closed",
  detailTitle: null,
  anchorLabel: null,
};

let probeOverlay: ProbeOverlayHandle | null = null;
let shellObserver: MutationObserver | null = null;
let detailObserver: MutationObserver | null = null;
let observedDetailRoot: Element | null = null;
let probeRefreshTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let probeModeInitialized = false;

function isElementVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  return style.display !== "none" && style.visibility !== "hidden";
}

function normalizeText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function describeElement(element: Element | null): string | null {
  if (!element) {
    return null;
  }

  const htmlElement = element as HTMLElement;
  const dataTestId = htmlElement.dataset.testid || htmlElement.dataset.testId;
  if (dataTestId) {
    return `data-testid=${dataTestId}`;
  }

  if (htmlElement.id) {
    return `#${htmlElement.id}`;
  }

  const className = typeof htmlElement.className === "string"
    ? htmlElement.className
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean)[0]
    : "";
  if (className) {
    return className;
  }

  return htmlElement.tagName.toLowerCase();
}

function findDetailPanelCandidate(): {
  root: Element | null;
  title: string | null;
  anchorLabel: string | null;
} {
  const candidateSelector = [
    "aside",
    "[role='dialog']",
    "[class*='drawer']",
    "[class*='panel']",
    "[class*='sidebar']",
  ].join(",");

  const candidates = Array.from(document.querySelectorAll(candidateSelector))
    .filter(isElementVisible);

  let bestCandidate: {
    root: Element;
    title: string | null;
    anchorLabel: string | null;
    score: number;
  } | null = null;

  for (const candidate of candidates) {
    const titleNode = candidate.querySelector(
      "h1, h2, h3, [class*='title'], [data-testid*='title']",
    );
    const headerNode = candidate.querySelector(
      "header, [class*='header'], [class*='toolbar']",
    );
    const fieldRowCount = candidate.querySelectorAll(
      "label, [class*='field-row'], [data-field-id], [class*='field']",
    ).length;
    const title = normalizeText(titleNode?.textContent);

    let score = 0;
    if (candidate.matches("aside, [role='dialog']")) {
      score += 1;
    }
    if (title) {
      score += 2;
    }
    if (headerNode) {
      score += 1;
    }
    if (fieldRowCount >= 2) {
      score += 2;
    }

    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = {
        root: candidate,
        title,
        anchorLabel: describeElement(headerNode ?? titleNode?.parentElement ?? candidate.firstElementChild),
        score,
      };
    }
  }

  if (!bestCandidate || bestCandidate.score < 4) {
    return {
      root: null,
      title: null,
      anchorLabel: null,
    };
  }

  return {
    root: bestCandidate.root,
    title: bestCandidate.title,
    anchorLabel: bestCandidate.anchorLabel,
  };
}

function updateDetailObserver(nextDetailRoot: Element | null): void {
  if (observedDetailRoot === nextDetailRoot) {
    return;
  }

  detailObserver?.disconnect();
  detailObserver = null;
  observedDetailRoot = nextDetailRoot;

  if (!nextDetailRoot) {
    return;
  }

  detailObserver = new MutationObserver(() => {
    scheduleProbeRefresh();
  });
  detailObserver.observe(nextDetailRoot, {
    childList: true,
    subtree: true,
    attributes: true,
  });
}

function refreshProbeState(): void {
  const detailPanel = findDetailPanelCandidate();

  probeState = {
    detailState: detailPanel.root ? "detail-ready" : "closed",
    detailTitle: detailPanel.title,
    anchorLabel: detailPanel.anchorLabel,
  };

  updateDetailObserver(detailPanel.root);

  probeOverlay?.render(probeState);
}

function scheduleProbeRefresh(): void {
  if (probeRefreshTimer !== null) {
    globalThis.clearTimeout(probeRefreshTimer);
  }

  probeRefreshTimer = globalThis.setTimeout(() => {
    probeRefreshTimer = null;
    refreshProbeState();
  }, 120);
}

function initProbeObservers(): void {
  if (shellObserver) {
    return;
  }

  const shellTarget = document.body ?? document.documentElement;
  if (!shellTarget) {
    return;
  }

  shellObserver = new MutationObserver(() => {
    scheduleProbeRefresh();
  });

  shellObserver.observe(shellTarget, {
    childList: true,
    subtree: true,
    attributes: true,
  });
}

function initProbeMode(): void {
  if (probeModeInitialized || !isInjectionProbeEnabled()) {
    return;
  }

  probeModeInitialized = true;
  probeOverlay = createProbeOverlay(refreshProbeState);
  initProbeObservers();
  refreshProbeState();
}

function detectLarkPageContext(): LarkPageContext | null {
  const url = window.location.href;

  const context: LarkPageContext = {
    pageType: 'lark_a1',
    url,
  };

  // Extract baseId and recordId from URL
  const urlMatch = url.match(/\/base\/([^/]+)\/table\/([^/]+)\/record\/([^/]+)/);
  if (urlMatch) {
    context.baseId = urlMatch[1];
    context.tableId = urlMatch[2];
    context.recordId = urlMatch[3];
  }

  // Try to detect Lark user ID from page
  const larkIdElement = document.querySelector('[data-user-id]') as HTMLElement;
  if (larkIdElement) {
    context.detectedLarkId = larkIdElement.dataset.userId;
  }

  return context;
}

/**
 * Extract auth code from Lark OAuth redirect
 * Lark redirects to: https://your-server.com/api/lark/auth/callback?code=xxx&state=yyy
 */
function extractAuthCodeFromRedirect(): { code: string; state: string } | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (code && state) {
    return { code, state };
  }

  return null;
}

/**
 * Get Lark user ID from page context
 */
function getLarkUserId(): string | null {
  // Try multiple selectors to find user ID
  const selectors = [
    '[data-user-id]',
    '[data-user_id]',
    '.user-id',
    '[id*="user"]',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      // Try data-user-id first
      if (element.dataset.userId) {
        return element.dataset.userId;
      }
      // Try innerText as fallback
      const id = element.innerText?.trim();
      if (id && id.length > 5) {
        return id;
      }
    }
  }

  // Try to find from script tags or global variables
  // @ts-ignore - Check for Lark global objects
  if (window.Lark?.user?.id) {
    // @ts-ignore
    return window.Lark.user.id;
  }

  return null;
}

function initLarkContentScript() {
  console.log('[Tenways Octo] Lark content script initialized');

  initProbeMode();

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'getPageContext') {
      const context = detectLarkPageContext();
      sendResponse(context);
    }

    if (message.action === 'getLarkAuthCode') {
      const authCode = extractAuthCodeFromRedirect();
      sendResponse(authCode);
    }

    if (message.action === 'getLarkUserId') {
      const userId = getLarkUserId();
      sendResponse({ userId });
    }
  });
}

const larkTestingTarget = globalThis as typeof globalThis & {
  __TENWAYS_LARK_TESTING__?: TenwaysLarkTestingApi;
};

larkTestingTarget.__TENWAYS_LARK_TESTING__ = {
  detectLarkPageContext,
  extractAuthCodeFromRedirect,
  getLarkUserId,
  initLarkContentScript,
  refreshProbeState,
  getProbeState: () => probeState,
};

// Initialize
initLarkContentScript();

export {};
