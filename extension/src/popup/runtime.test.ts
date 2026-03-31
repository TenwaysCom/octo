import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../background/config.js", () => ({
  DEFAULT_CONFIG: {
    SERVER_URL: "http://localhost:3000",
    MEEGLE_PLUGIN_ID: "",
    LARK_APP_ID: "cli_test",
    MEEGLE_BASE_URL: "https://project.larksuite.com",
  },
  getConfig: vi.fn(),
}));

import {
  getConfig,
  loadPopupSettings,
  requestMeegleUserIdentity,
} from "./runtime.js";

describe("popup runtime settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        SERVER_URL: "http://localhost:3000",
        MEEGLE_PLUGIN_ID: "MII_STALE_LOCAL_PLUGIN",
      });
    });

    vi.mocked(getConfig).mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
      LARK_APP_ID: "cli_server_public",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
    });

    await expect(loadPopupSettings()).resolves.toEqual({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
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
  });
});
