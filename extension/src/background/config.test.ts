import { beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "./config.js";

describe("extension config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers public config from the server for non-secret values", async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation((defaults, callback) => {
      const resolvedDefaults = defaults as Record<string, unknown>;
      callback({
        ...resolvedDefaults,
        SERVER_URL: "https://octo.odoo.tenways.it:18443",
        MEEGLE_PLUGIN_ID: "local-plugin-id",
      });
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
          LARK_APP_ID: "cli_server_public",
          MEEGLE_BASE_URL: "https://tenant.meegle.com",
          LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
        },
      }),
    } as Response);

    await expect(getConfig()).resolves.toMatchObject({
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
      LARK_APP_ID: "cli_server_public",
      MEEGLE_BASE_URL: "https://tenant.meegle.com",
      LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
    });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      {
        MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
        LARK_APP_ID: "cli_server_public",
        MEEGLE_BASE_URL: "https://tenant.meegle.com",
        LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
      },
      expect.any(Function),
    );
  });

  it("falls back to locally stored config when public config cannot be fetched", async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation((defaults, callback) => {
      const resolvedDefaults = defaults as Record<string, unknown>;
      callback({
        ...resolvedDefaults,
        SERVER_URL: "https://octo.odoo.tenways.it:18443",
        MEEGLE_PLUGIN_ID: "MII_LOCAL_PLUGIN",
        LARK_APP_ID: "cli_local",
      });
    });

    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    await expect(getConfig()).resolves.toMatchObject({
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
      MEEGLE_PLUGIN_ID: "MII_LOCAL_PLUGIN",
      LARK_APP_ID: "cli_local",
    });
  });

  it("uses the code default SERVER_URL when no override is stored", async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation((defaults, callback) => {
      callback(defaults as Record<string, unknown>);
    });

    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    await expect(getConfig()).resolves.toMatchObject({
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
    });
  });
});
