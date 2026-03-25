import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHttpMeegleAuthAdapter, type HttpMeegleAuthAdapterOptions } from "./auth-adapter.js";

describe("auth-adapter", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let adapter: ReturnType<typeof createHttpMeegleAuthAdapter>;

  const defaultOptions: HttpMeegleAuthAdapterOptions = {
    pluginId: "MII_TEST_PLUGIN",
    pluginSecret: "test_secret",
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    adapter = createHttpMeegleAuthAdapter({
      ...defaultOptions,
      fetchImpl: mockFetch,
    });
  });

  describe("getPluginToken", () => {
    it("should get plugin token from Meegle API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ plugin_access_token: "plugin_token_123" }),
      });

      const token = await adapter.getPluginToken("https://project.larksuite.com");

      expect(token).toBe("plugin_token_123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://project.larksuite.com/bff/v2/authen/plugin_token",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("MII_TEST_PLUGIN"),
        }),
      );
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(adapter.getPluginToken("https://project.larksuite.com")).rejects.toThrow();
    });

    it("should extract token from alternative field names", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "alt_token_456" }),
      });

      const token = await adapter.getPluginToken("https://project.larksuite.com");

      expect(token).toBe("alt_token_456");
    });
  });

  describe("exchangeUserToken", () => {
    it("should exchange auth code for user token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user_access_token: "user_token_789",
          refresh_token: "refresh_token_abc",
        }),
      });

      const result = await adapter.exchangeUserToken({
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        authCode: "auth_code_456",
      });

      expect(result.userToken).toBe("user_token_789");
      expect(result.refreshToken).toBe("refresh_token_abc");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://project.larksuite.com/bff/v2/authen/user_plugin_token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Plugin-Token": "plugin_token_123",
          }),
        }),
      );
    });

    it("should throw on exchange failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(
        adapter.exchangeUserToken({
          baseUrl: "https://project.larksuite.com",
          pluginToken: "plugin_token_123",
          authCode: "invalid_code",
        }),
      ).rejects.toThrow();
    });
  });

  describe("refreshUserToken", () => {
    it("should refresh user token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user_access_token: "new_user_token_xyz",
          refresh_token: "new_refresh_token_uvw",
        }),
      });

      const result = await adapter.refreshUserToken({
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        refreshToken: "old_refresh_token",
      });

      expect(result.userToken).toBe("new_user_token_xyz");
      expect(result.refreshToken).toBe("new_refresh_token_uvw");
    });
  });
});