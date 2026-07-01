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

      const result = await adapter.getPluginToken("https://project.larksuite.com");

      expect(result).toMatchObject({
        token: "plugin_token_123",
      });
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
        json: async () => ({
          error: {
            code: 10204,
            msg: "wrong plugin secret",
          },
        }),
      });

      await expect(
        adapter.getPluginToken("https://project.larksuite.com"),
      ).rejects.toThrow("Failed to get plugin token: 401 wrong plugin secret");
    });

    it("should extract token from alternative field names", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "alt_token_456" }),
      });

      const result = await adapter.getPluginToken("https://project.larksuite.com");

      expect(result).toMatchObject({
        token: "alt_token_456",
      });
    });

    it("should extract plugin token from nested data payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            token: "nested_plugin_token_456",
            expire_time: 7200,
          },
          error: {
            code: 0,
            msg: "success",
          },
        }),
      });

      const result = await adapter.getPluginToken("https://project.larksuite.com");

      expect(result).toEqual({
        token: "nested_plugin_token_456",
        expiresInSeconds: 7200,
      });
    });
  });

  describe("exchangeUserToken", () => {
    it("should exchange auth code for user token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user_access_token: "user_token_789",
          refresh_token: "refresh_token_abc",
          expires_in: 7200,
          refresh_token_expires_in: 1209600,
        }),
      });

      const result = await adapter.exchangeUserToken({
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        authCode: "auth_code_456",
      });

      expect(result.userToken).toBe("user_token_789");
      expect(result.refreshToken).toBe("refresh_token_abc");
      expect(result.expiresInSeconds).toBe(7200);
      expect(result.refreshTokenExpiresInSeconds).toBe(1209600);
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

    it("should extract user token from nested data payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            user_access_token: "nested_user_token_789",
            refresh_token: "nested_refresh_token_abc",
            expire_time: 7200,
            refresh_token_expire_time: 1209600,
          },
          error: {
            code: 0,
            msg: "success",
          },
        }),
      });

      const result = await adapter.exchangeUserToken({
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        authCode: "auth_code_456",
      });

      expect(result.userToken).toBe("nested_user_token_789");
      expect(result.refreshToken).toBe("nested_refresh_token_abc");
      expect(result.expiresInSeconds).toBe(7200);
      expect(result.refreshTokenExpiresInSeconds).toBe(1209600);
    });
  });

  describe("refreshUserToken", () => {
    it("should refresh user token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user_access_token: "new_user_token_xyz",
          refresh_token: "new_refresh_token_uvw",
          expires_in: 3600,
          refresh_token_expires_in: 1209600,
        }),
      });

      const result = await adapter.refreshUserToken({
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        refreshToken: "old_refresh_token",
      });

      expect(result.userToken).toBe("new_user_token_xyz");
      expect(result.refreshToken).toBe("new_refresh_token_uvw");
      expect(result.expiresInSeconds).toBe(3600);
      expect(result.refreshTokenExpiresInSeconds).toBe(1209600);
    });

    it("should extract refreshed token metadata from nested data payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            token: "new_user_token_xyz",
            refresh_token: "new_refresh_token_uvw",
            expire_time: 3600,
            refresh_token_expire_time: 1209600,
          },
          error: {
            code: 0,
            msg: "success",
          },
        }),
      });

      const result = await adapter.refreshUserToken({
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        refreshToken: "old_refresh_token",
      });

      expect(result).toEqual({
        userToken: "new_user_token_xyz",
        refreshToken: "new_refresh_token_uvw",
        expiresInSeconds: 3600,
        refreshTokenExpiresInSeconds: 1209600,
      });
    });
  });
});
