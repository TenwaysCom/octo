import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../background/config.js", () => ({
  DEFAULT_CONFIG: {
    SERVER_URL: "https://octo.odoo.tenways.it:18443",
    MEEGLE_PLUGIN_ID: "",
    LARK_APP_ID: "cli_test",
    LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
    MEEGLE_BASE_URL: "https://project.larksuite.com",
  },
  getConfig: vi.fn(),
}));

import {
  postClientDebugLog,
  getConfig,
  getLarkAuthStatus,
  resolveIdentityRequest,
  loadPopupSettings,
  runLarkAuthRequest,
  watchLarkAuthCallbackResult,
  requestMeegleUserIdentity,
} from "./runtime.js";
import { clearLogBuffer, getLogBuffer, setLogLevel } from "../logger.js";

describe("popup runtime settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    setLogLevel("info");
  });

  it("prefers the latest meegle plugin id from server config over stale local sync storage", async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((keys, callback) => {
      callback?.({
        meegleUserKey: "user_test",
        larkUserId: "ou_test",
      });
    });

    vi.mocked(chrome.storage.sync.get).mockImplementation((defaults, callback) => {
      callback?.({
        ...(defaults as Record<string, unknown>),
        SERVER_URL: "https://octo.odoo.tenways.it:18443",
        MEEGLE_PLUGIN_ID: "MII_STALE_LOCAL_PLUGIN",
      });
    });

    vi.mocked(getConfig).mockResolvedValue({
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
      LARK_APP_ID: "cli_server_public",
      LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_OAUTH_SCOPE: "offline_access",
    });

    await expect(loadPopupSettings()).resolves.toEqual({
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
      LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
      meegleUserKey: "user_test",
      larkUserId: "ou_test",
    });
  });

  it("falls back to background cookie lookup when the content script cannot read meegle cookies", async () => {
    vi.mocked(chrome.tabs.sendMessage).mockImplementation((...args) => {
      const callback = args[2] as ((response?: unknown) => void) | undefined;
      callback?.(undefined);
      return undefined as never;
    });
    vi.mocked(chrome.runtime.sendMessage).mockImplementation((...args) => {
      const [message] = args as unknown as [
        { action: string; payload?: unknown },
      ];
      const maybeCallback = args[args.length - 1] as
        | ((response?: unknown) => void)
        | undefined;
      expect(message).toEqual({
        action: "itdog.meegle.identity.cookies",
        payload: {
            pageUrl: "https://project.larksuite.com/4c3fv6/overview",
          },
        });

      maybeCallback?.({
        payload: {
          userKey: "7538275242901291040",
          tenantKey: "saas_7538275207677476895",
        },
      });
      return undefined as never;
    });

    await expect(
      requestMeegleUserIdentity(
        12,
        "https://project.larksuite.com/4c3fv6/overview",
      ),
    ).resolves.toEqual({
      userKey: "7538275242901291040",
      tenantKey: "saas_7538275207677476895",
    });

    expect(getLogBuffer()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: "popup:runtime",
          level: "debug",
          message: "requestMeegleUserIdentity.cookie_fallback.start",
          detail: expect.objectContaining({
            tabId: 12,
          }),
        }),
        expect.objectContaining({
          module: "popup:runtime",
          level: "debug",
          message: "requestMeegleUserIdentity.done",
          detail: expect.objectContaining({
            source: "cookie",
            hasUserKey: true,
          }),
        }),
      ]),
    );
  });

  it("logs identity resolve requests and responses for diagnosis", async () => {
    vi.mocked(getConfig).mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
      LARK_APP_ID: "cli_server_public",
      LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_OAUTH_SCOPE: "offline_access",
      CLIENT_DEBUG_LOG_UPLOAD_ENABLED: true,
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          masterUserId: "usr_resolved",
          identityStatus: "active",
          operatorLarkId: "ou_resolved",
          meegleUserKey: "user_resolved",
        },
      }),
    } as Response);

    await expect(
      resolveIdentityRequest({
        operatorLarkId: "ou_page_user",
        meegleUserKey: "user_page_user",
        pageContext: {
          platform: "meegle",
          baseUrl: "https://project.larksuite.com",
          pathname: "/4c3fv6/overview",
        },
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        masterUserId: "usr_resolved",
        identityStatus: "active",
        operatorLarkId: "ou_resolved",
        meegleUserKey: "user_resolved",
      },
    });

    expect(getLogBuffer()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: "popup:runtime",
          level: "debug",
          message: "resolveIdentityRequest.start",
          detail: expect.objectContaining({
            platform: "meegle",
            hasOperatorLarkId: true,
            hasMeegleUserKey: true,
          }),
        }),
        expect.objectContaining({
          module: "popup:runtime",
          level: "debug",
          message: "resolveIdentityRequest.done",
          detail: expect.objectContaining({
            ok: true,
            identityStatus: "active",
            hasMasterUserId: true,
          }),
        }),
      ]),
    );
  });

  it("sends masterUserId when requesting Lark auth through the background", async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation((...args) => {
      const maybeCallback = args[args.length - 1] as
        | ((response?: unknown) => void)
        | undefined;
      maybeCallback?.({
        payload: {
          status: "in_progress",
          baseUrl: "https://open.larksuite.com",
          state: "state_123",
        },
      });
      return undefined as never;
    });

    await expect(
      runLarkAuthRequest({
        masterUserId: "usr_resolved",
        baseUrl: "https://open.larksuite.com",
      }),
    ).resolves.toMatchObject({
      status: "in_progress",
      state: "state_123",
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      {
        action: "itdog.lark.auth.ensure",
        payload: expect.objectContaining({
          masterUserId: "usr_resolved",
          baseUrl: "https://open.larksuite.com",
        }),
      },
      expect.any(Function),
    );
  });

  it("posts popup debug logs to the local debug endpoint", async () => {
    vi.mocked(getConfig).mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
      LARK_APP_ID: "cli_server_public",
      LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_OAUTH_SCOPE: "offline_access",
      CLIENT_DEBUG_LOG_UPLOAD_ENABLED: true,
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await expect(
      postClientDebugLog({
        source: "popup:app",
        level: "info",
        event: "acp.send.start",
        detail: {
          activePage: "chat",
        },
      }),
    ).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/debug/client-log",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: expect.any(String),
        keepalive: true,
      }),
    );
  });

  it("does not upload popup debug logs when client debug upload is disabled", async () => {
    vi.mocked(getConfig).mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
      LARK_APP_ID: "cli_server_public",
      LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_OAUTH_SCOPE: "offline_access",
      CLIENT_DEBUG_LOG_UPLOAD_ENABLED: false,
    });

    await expect(
      postClientDebugLog({
        source: "popup:app",
        level: "info",
        event: "acp.send.start",
      }),
    ).resolves.toBe(false);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("requests lark auth status from the server without opening oauth", async () => {
    vi.mocked(getConfig).mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
      LARK_APP_ID: "cli_server_public",
      LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_OAUTH_SCOPE: "offline_access",
      CLIENT_DEBUG_LOG_UPLOAD_ENABLED: false,
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          status: "require_auth",
          baseUrl: "https://open.larksuite.com",
          masterUserId: "usr_resolved",
          reason: "No stored Lark token found",
        },
      }),
    } as Response);

    await expect(
      getLarkAuthStatus({
        masterUserId: "usr_resolved",
        baseUrl: "https://open.larksuite.com",
      }),
    ).resolves.toEqual({
      status: "require_auth",
      baseUrl: "https://open.larksuite.com",
      masterUserId: "usr_resolved",
      reason: "No stored Lark token found",
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/lark/auth/status",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("watches storage changes for callback completion results", async () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    chrome.storage.onChanged = {
      addListener,
      removeListener,
    } as unknown as typeof chrome.storage.onChanged;

    const listener = vi.fn();
    const unsubscribe = watchLarkAuthCallbackResult(listener);

    const registered = addListener.mock.calls[0]?.[0] as
      | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
      | undefined;

    registered?.(
      {
        itpm_assistant_auth: {
          newValue: {
            lastLarkAuthResult: {
              state: "state_123",
              status: "ready",
              masterUserId: "usr_xxx",
            },
          },
          oldValue: {},
        },
      },
      "local",
    );

    expect(listener).toHaveBeenCalledWith({
      state: "state_123",
      status: "ready",
      masterUserId: "usr_xxx",
    });

    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(registered);
  });
});
