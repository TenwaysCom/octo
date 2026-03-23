// Meegle content script - handles auth code requests

import { requestMeegleAuthCode } from '../page-bridge/meegle-auth.js';

export function initMeegleContentScript() {
  console.log('[IT PM Assistant] Meegle content script initialized');

  // Listen for auth code requests from background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'itdog.page.meegle.auth_code.request') {
      const { pluginId, state } = message.payload;

      requestMeegleAuthCode(pluginId, state)
        .then((result) => {
          if (result) {
            sendResponse({
              ok: true,
              data: result,
            });
          } else {
            sendResponse({
              ok: false,
              error: {
                errorCode: 'AUTH_CODE_REQUEST_FAILED',
                errorMessage: 'Failed to obtain auth code',
              },
            });
          }
        })
        .catch((err: Error) => {
          sendResponse({
            ok: false,
            error: {
              errorCode: 'AUTH_CODE_ERROR',
              errorMessage: err.message,
            },
          });
        });

      return true; // Keep channel open for async response
    }
  });
}

// Initialize
initMeegleContentScript();
