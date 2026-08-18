import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConfig,
  isLarkOAuthCallbackCompatibleWithServer,
  setConfig,
} from "./config.js";

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
          LARK_OAUTH_CALLBACK_URL: "https://octo.odoo.tenways.it:18443/api/lark/auth/callback",
          CLIENT_DEBUG_LOG_UPLOAD_ENABLED: true,
        },
      }),
    } as Response);

    await expect(getConfig()).resolves.toMatchObject({
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
      MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
      LARK_APP_ID: "cli_server_public",
      MEEGLE_BASE_URL: "https://tenant.meegle.com",
      LARK_OAUTH_CALLBACK_URL: "https://octo.odoo.tenways.it:18443/api/lark/auth/callback",
      CLIENT_DEBUG_LOG_UPLOAD_ENABLED: true,
    });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      {
        MEEGLE_PLUGIN_ID: "MII_SERVER_PLUGIN",
        LARK_APP_ID: "cli_server_public",
        MEEGLE_BASE_URL: "https://tenant.meegle.com",
        LARK_OAUTH_CALLBACK_URL: "https://octo.odoo.tenways.it:18443/api/lark/auth/callback",
        CLIENT_DEBUG_LOG_UPLOAD_ENABLED: true,
        PUBLIC_CONFIG_SOURCE_SERVER_ORIGIN: "https://octo.odoo.tenways.it:18443",
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
        LARK_OAUTH_CALLBACK_URL: "https://octo.odoo.tenways.it:18443/api/lark/auth/callback",
      });
    });

    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    await expect(getConfig()).resolves.toMatchObject({
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
      MEEGLE_PLUGIN_ID: "MII_LOCAL_PLUGIN",
      LARK_APP_ID: "cli_local",
      LARK_OAUTH_CALLBACK_URL: "https://octo.odoo.tenways.it:18443/api/lark/auth/callback",
    });
  });

  it("does not reuse production public config after switching to test", async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation((_defaults, callback) => {
      callback({
        ENV_NAME: "test",
        SERVER_URL: "https://octotest.odoo.tenways.it:18443",
        MEEGLE_PLUGIN_ID: "MII_PROD_PLUGIN",
        LARK_APP_ID: "cli_prod",
        LARK_OAUTH_CALLBACK_URL: "https://octo.odoo.tenways.it:18443/api/lark/auth/callback",
        PUBLIC_CONFIG_SOURCE_SERVER_ORIGIN: "https://octo.odoo.tenways.it:18443",
      });
    });
    vi.mocked(fetch).mockRejectedValue(new Error("test server unavailable"));

    await expect(getConfig()).resolves.toMatchObject({
      ENV_NAME: "test",
      SERVER_URL: "https://octotest.odoo.tenways.it:18443",
      MEEGLE_PLUGIN_ID: "",
      LARK_APP_ID: "",
      LARK_OAUTH_CALLBACK_URL: "",
    });
  });

  it("refreshes the public config from test after the environment is saved", async () => {
    const storedConfig: Record<string, unknown> = {
      ENV_NAME: "prod",
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
      LARK_APP_ID: "cli_prod",
      LARK_OAUTH_CALLBACK_URL: "https://octo.odoo.tenways.it:18443/api/lark/auth/callback",
      PUBLIC_CONFIG_SOURCE_SERVER_ORIGIN: "https://octo.odoo.tenways.it:18443",
    };
    vi.mocked(chrome.storage.sync.get).mockImplementation((_defaults, callback) => {
      callback({ ...storedConfig });
    });
    vi.mocked(chrome.storage.sync.set).mockImplementation((updates, callback) => {
      Object.assign(storedConfig, updates);
      callback?.();
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          MEEGLE_PLUGIN_ID: "MII_TEST_PLUGIN",
          LARK_APP_ID: "cli_test",
          LARK_OAUTH_CALLBACK_URL: "https://octotest.odoo.tenways.it:18443/api/lark/auth/callback",
        },
      }),
    } as Response);

    await setConfig({
      ENV_NAME: "test",
      SERVER_URL: "https://octotest.odoo.tenways.it:18443",
    });

    await expect(getConfig()).resolves.toMatchObject({
      ENV_NAME: "test",
      SERVER_URL: "https://octotest.odoo.tenways.it:18443",
      LARK_APP_ID: "cli_test",
      LARK_OAUTH_CALLBACK_URL: "https://octotest.odoo.tenways.it:18443/api/lark/auth/callback",
    });
    expect(storedConfig).toMatchObject({
      PUBLIC_CONFIG_SOURCE_SERVER_ORIGIN: "https://octotest.odoo.tenways.it:18443",
      LARK_OAUTH_CALLBACK_URL: "https://octotest.odoo.tenways.it:18443/api/lark/auth/callback",
    });
  });

  it("rejects a callback returned for a different environment", async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation((_defaults, callback) => {
      callback({
        ENV_NAME: "test",
        SERVER_URL: "https://octotest.odoo.tenways.it:18443",
      });
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          MEEGLE_PLUGIN_ID: "MII_TEST_PLUGIN",
          LARK_APP_ID: "cli_test",
          LARK_OAUTH_CALLBACK_URL: "https://octo.odoo.tenways.it:18443/api/lark/auth/callback",
        },
      }),
    } as Response);

    await expect(getConfig()).resolves.toMatchObject({
      ENV_NAME: "test",
      SERVER_URL: "https://octotest.odoo.tenways.it:18443",
      LARK_APP_ID: "",
      LARK_OAUTH_CALLBACK_URL: "",
    });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
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

  it("resolves SERVER_URL from ENV_NAME=dev when configured", async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation((defaults, callback) => {
      const resolvedDefaults = defaults as Record<string, unknown>;
      callback({
        ...resolvedDefaults,
        ENV_NAME: "dev",
      });
    });

    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    await expect(getConfig()).resolves.toMatchObject({
      ENV_NAME: "dev",
      SERVER_URL: "http://localhost:3040",
    });
  });

  it("keeps an explicitly customized SERVER_URL for a selected environment", async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation((defaults, callback) => {
      const resolvedDefaults = defaults as Record<string, unknown>;
      callback({
        ...resolvedDefaults,
        ENV_NAME: "dev",
        SERVER_URL: "http://localhost:3041",
      });
    });

    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    await expect(getConfig()).resolves.toMatchObject({
      ENV_NAME: "dev",
      SERVER_URL: "http://localhost:3041",
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

  it("requires the callback to match the selected server origin and exact path", () => {
    expect(isLarkOAuthCallbackCompatibleWithServer({
      serverUrl: "https://octotest.odoo.tenways.it:18443",
      callbackUrl: "https://octotest.odoo.tenways.it:18443/api/lark/auth/callback",
    })).toBe(true);
    expect(isLarkOAuthCallbackCompatibleWithServer({
      serverUrl: "https://octotest.odoo.tenways.it:18443",
      callbackUrl: "https://octo.odoo.tenways.it:18443/api/lark/auth/callback",
    })).toBe(false);
    expect(isLarkOAuthCallbackCompatibleWithServer({
      serverUrl: "https://octotest.odoo.tenways.it:18443",
      callbackUrl: "https://octotest.odoo.tenways.it:18443/api/lark/auth/callback/other",
    })).toBe(false);
  });
});
