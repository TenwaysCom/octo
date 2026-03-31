import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  exchangeCredential,
  refreshCredential,
  type CredentialExchangeInput,
  type MeegleCredentialServiceDeps,
} from "./meegle-credential.service.js";
import type { MeegleAuthAdapter } from "../../adapters/meegle/auth-adapter.js";
import type { MeegleTokenStore, StoredMeegleToken } from "../../adapters/meegle/token-store.js";

describe("meegle-credential.service", () => {
  const now = new Date("2026-03-26T10:00:00.000Z");
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let mockAuthAdapter: MeegleAuthAdapter;
  let mockTokenStore: MeegleTokenStore;
  let deps: MeegleCredentialServiceDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockAuthAdapter = {
      getPluginToken: vi.fn().mockResolvedValue({
        token: "plugin_token_123",
        expiresInSeconds: 7200,
      }),
      exchangeUserToken: vi.fn().mockResolvedValue({
        userToken: "user_token_456",
        refreshToken: "refresh_token_789",
        expiresInSeconds: 3600,
        refreshTokenExpiresInSeconds: 1209600,
      }),
      refreshUserToken: vi.fn().mockResolvedValue({
        userToken: "new_user_token_abc",
        refreshToken: "new_refresh_token_def",
        expiresInSeconds: 3600,
        refreshTokenExpiresInSeconds: 1209600,
      }),
    };

    const storedTokens: Map<string, StoredMeegleToken> = new Map();

    mockTokenStore = {
      save: vi.fn(async (token: StoredMeegleToken) => {
        const key = `${token.masterUserId}:${token.meegleUserKey}:${token.baseUrl}`;
        storedTokens.set(key, token);
      }),
      get: vi.fn(async (lookup) => {
        const key = `${lookup.masterUserId}:${lookup.meegleUserKey}:${lookup.baseUrl}`;
        const exact = storedTokens.get(key);
        if (exact) {
          return exact;
        }

        for (const token of storedTokens.values()) {
          if (
            token.masterUserId === lookup.masterUserId &&
            token.meegleUserKey === lookup.meegleUserKey
          ) {
            return token;
          }
        }

        return undefined;
      }),
      delete: vi.fn(async (lookup) => {
        const key = `${lookup.masterUserId}:${lookup.meegleUserKey}:${lookup.baseUrl}`;
        storedTokens.delete(key);
      }),
    };

    deps = {
      authAdapter: mockAuthAdapter,
      tokenStore: mockTokenStore,
    };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  describe("exchangeCredential", () => {
    it("should exchange auth code for token and store it", async () => {
      const input: CredentialExchangeInput = {
        requestId: "req_001",
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        authCode: "auth_code_123",
        state: "state_456",
      };

      const result = await exchangeCredential(input, deps);

      expect(result.tokenStatus).toBe("ready");
      expect(result.credentialStatus).toBe("active");
      expect(result.userToken).toBe("user_token_456");
      expect(result.refreshToken).toBe("refresh_token_789");
      expect(result.expiresAt).toBe("2026-03-26T11:00:00.000Z");
      expect(mockAuthAdapter.getPluginToken).toHaveBeenCalledWith(input.baseUrl);
      expect(mockAuthAdapter.exchangeUserToken).toHaveBeenCalledWith({
        baseUrl: input.baseUrl,
        pluginToken: "plugin_token_123",
        authCode: input.authCode,
        state: input.state,
      });
      expect(mockTokenStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginToken: "plugin_token_123",
          pluginTokenExpiresAt: "2026-03-26T12:00:00.000Z",
          userToken: "user_token_456",
          userTokenExpiresAt: "2026-03-26T11:00:00.000Z",
          refreshToken: "refresh_token_789",
          refreshTokenExpiresAt: "2026-04-09T10:00:00.000Z",
          credentialStatus: "active",
        }),
      );
    });

    it("should throw if auth adapter fails", async () => {
      vi.mocked(mockAuthAdapter.getPluginToken).mockRejectedValue(new Error("Plugin token failed"));

      const input: CredentialExchangeInput = {
        requestId: "req_001",
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        authCode: "auth_code_123",
      };

      await expect(exchangeCredential(input, deps)).rejects.toThrow("Plugin token failed");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Tenways Octo] Meegle credential exchange failed:",
        expect.objectContaining({
          requestId: "req_001",
          masterUserId: "usr_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
          stage: "get_plugin_token",
          message: "Plugin token failed",
        }),
      );
    });
  });

  describe("refreshCredential", () => {
    it("should reuse stored token when it is still valid", async () => {
      const storedToken: StoredMeegleToken = {
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        pluginTokenExpiresAt: "2026-03-26T12:00:00.000Z",
        userToken: "old_user_token",
        userTokenExpiresAt: "2026-03-26T10:30:00.000Z",
        refreshToken: "old_refresh_token",
        refreshTokenExpiresAt: "2026-04-09T10:00:00.000Z",
        credentialStatus: "active",
      };
      await mockTokenStore.save(storedToken);

      const result = await refreshCredential(
        {
          masterUserId: "usr_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.tokenStatus).toBe("ready");
      expect(result.credentialStatus).toBe("active");
      expect(result.userToken).toBe("old_user_token");
      expect(result.expiresAt).toBe("2026-03-26T10:30:00.000Z");
      expect(mockAuthAdapter.refreshUserToken).not.toHaveBeenCalled();
    });

    it("should reuse a stored token even when the requested baseUrl comes from a different page origin", async () => {
      const storedToken: StoredMeegleToken = {
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        pluginTokenExpiresAt: "2026-03-26T12:00:00.000Z",
        userToken: "old_user_token",
        userTokenExpiresAt: "2026-03-26T10:30:00.000Z",
        refreshToken: "old_refresh_token",
        refreshTokenExpiresAt: "2026-04-09T10:00:00.000Z",
        credentialStatus: "active",
      };
      await mockTokenStore.save(storedToken);

      const result = await refreshCredential(
        {
          masterUserId: "usr_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://meegle.com",
        },
        deps,
      );

      expect(result.tokenStatus).toBe("ready");
      expect(result.baseUrl).toBe("https://project.larksuite.com");
      expect(result.userToken).toBe("old_user_token");
      expect(mockAuthAdapter.refreshUserToken).not.toHaveBeenCalled();
    });

    it("should refresh token when stored user token is expired", async () => {
      const storedToken: StoredMeegleToken = {
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        pluginToken: "stale_plugin_token",
        pluginTokenExpiresAt: "2026-03-26T09:00:00.000Z",
        userToken: "old_user_token",
        userTokenExpiresAt: "2026-03-26T09:30:00.000Z",
        refreshToken: "old_refresh_token",
        refreshTokenExpiresAt: "2026-04-09T10:00:00.000Z",
        credentialStatus: "active",
      };
      await mockTokenStore.save(storedToken);

      const result = await refreshCredential(
        {
          masterUserId: "usr_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.tokenStatus).toBe("ready");
      expect(result.credentialStatus).toBe("active");
      expect(result.userToken).toBe("new_user_token_abc");
      expect(result.expiresAt).toBe("2026-03-26T11:00:00.000Z");
      expect(mockAuthAdapter.getPluginToken).toHaveBeenCalledWith("https://project.larksuite.com");
      expect(mockAuthAdapter.refreshUserToken).toHaveBeenCalledWith({
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        refreshToken: "old_refresh_token",
      });
    });

    it("should return require_auth_code when no stored token", async () => {
      const result = await refreshCredential(
        {
          masterUserId: "usr_unknown",
          meegleUserKey: "user_unknown",
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.tokenStatus).toBe("require_auth_code");
    });

    it("should return require_auth_code when refresh fails", async () => {
      // Store a token
      const storedToken: StoredMeegleToken = {
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        pluginTokenExpiresAt: "2026-03-26T12:00:00.000Z",
        userToken: "old_user_token",
        userTokenExpiresAt: "2026-03-26T09:30:00.000Z",
        refreshToken: "old_refresh_token",
        refreshTokenExpiresAt: "2026-04-09T10:00:00.000Z",
        credentialStatus: "active",
      };
      await mockTokenStore.save(storedToken);

      // Make refresh fail
      vi.mocked(mockAuthAdapter.refreshUserToken).mockRejectedValue(new Error("Refresh failed"));

      const result = await refreshCredential(
        {
          masterUserId: "usr_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.tokenStatus).toBe("require_auth_code");
      expect(result.errorCode).toBe("MEEGLE_TOKEN_REFRESH_FAILED");
    });

    it("should return require_auth_code when refresh token is expired", async () => {
      const storedToken: StoredMeegleToken = {
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        pluginTokenExpiresAt: "2026-03-26T12:00:00.000Z",
        userToken: "old_user_token",
        userTokenExpiresAt: "2026-03-26T09:30:00.000Z",
        refreshToken: "old_refresh_token",
        refreshTokenExpiresAt: "2026-03-26T09:59:00.000Z",
        credentialStatus: "active",
      };
      await mockTokenStore.save(storedToken);

      const result = await refreshCredential(
        {
          masterUserId: "usr_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.tokenStatus).toBe("require_auth_code");
      expect(mockAuthAdapter.refreshUserToken).not.toHaveBeenCalled();
      expect(mockTokenStore.delete).toHaveBeenCalledWith({
        masterUserId: "usr_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
      });
    });
  });
});
