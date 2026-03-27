// Lark content script - detects page context and injects page bridge

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
};

// Initialize
initLarkContentScript();

export {};
