// Lark content script - detects page context and injects page bridge

import type { PageContext } from '../types/context.js';

export function detectLarkPageContext(): PageContext | null {
  const url = window.location.href;

  const context: PageContext = {
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

export function initLarkContentScript() {
  console.log('[IT PM Assistant] Lark content script initialized');

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'getPageContext') {
      const context = detectLarkPageContext();
      sendResponse(context);
    }
  });
}

// Initialize
initLarkContentScript();
