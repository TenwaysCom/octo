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
          CLIENT_DEBUG_LOG_UPLOAD_ENABLED: true,
        },
      }),
    } as Response);

    await expect(getConfig()).resolves.toMatchObject({
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
      LARK_APP_ID: "cli_server_public",
      MEEGLE_BASE_URL: "https://tenant.meegle.com",
      LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
      CLIENT_DEBUG_LOG_UPLOAD_ENABLED: true,
    });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      {
        MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
        LARK_APP_ID: "cli_server_public",
        MEEGLE_BASE_URL: "https://tenant.meegle.com",
        LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
        CLIENT_DEBUG_LOG_UPLOAD_ENABLED: true,
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

  it("resolves SERVER_URL from ENV_NAME=test when configured", async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation((defaults, callback) => {
      const resolvedDefaults = defaults as Record<string, unknown>;
      callback({
        ...resolvedDefaults,
        ENV_NAME: "test",
      });
    });

    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    await expect(getConfig()).resolves.toMatchObject({
      ENV_NAME: "test",
      SERVER_URL: "https://octotest.odoo.tenways.it:18443",
    });
  });

  it("keeps backward compatibility with an explicitly stored SERVER_URL", async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation((defaults, callback) => {
      const resolvedDefaults = defaults as Record<string, unknown>;
      callback({
        ...resolvedDefaults,
        SERVER_URL: "https://custom.example.com",
      });
    });

    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    await expect(getConfig()).resolves.toMatchObject({
      SERVER_URL: "https://custom.example.com",
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
