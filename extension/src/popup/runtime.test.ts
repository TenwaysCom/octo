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

import { getConfig, loadPopupSettings } from "./runtime.js";

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
});
