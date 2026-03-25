import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exchangeCredential,
  refreshCredential,
  type CredentialExchangeInput,
  type MeegleCredentialServiceDeps,
} from "./meegle-credential.service.js";
import type { MeegleAuthAdapter } from "../../adapters/meegle/auth-adapter.js";
import type { MeegleTokenStore, StoredMeegleToken } from "../../adapters/meegle/token-store.js";

describe("meegle-credential.service", () => {
  let mockAuthAdapter: MeegleAuthAdapter;
  let mockTokenStore: MeegleTokenStore;
  let deps: MeegleCredentialServiceDeps;

  beforeEach(() => {
    mockAuthAdapter = {
      getPluginToken: vi.fn().mockResolvedValue("plugin_token_123"),
      exchangeUserToken: vi.fn().mockResolvedValue({
        userToken: "user_token_456",
        refreshToken: "refresh_token_789",
      }),
      refreshUserToken: vi.fn().mockResolvedValue({
        userToken: "new_user_token_abc",
        refreshToken: "new_refresh_token_def",
      }),
    };

    const storedTokens: Map<string, StoredMeegleToken> = new Map();

    mockTokenStore = {
      save: vi.fn(async (token: StoredMeegleToken) => {
        const key = `${token.operatorLarkId}:${token.meegleUserKey}:${token.baseUrl}`;
        storedTokens.set(key, token);
      }),
      get: vi.fn(async (lookup) => {
        const key = `${lookup.operatorLarkId}:${lookup.meegleUserKey}:${lookup.baseUrl}`;
        return storedTokens.get(key);
      }),
      delete: vi.fn(async (lookup) => {
        const key = `${lookup.operatorLarkId}:${lookup.meegleUserKey}:${lookup.baseUrl}`;
        storedTokens.delete(key);
      }),
    };

    deps = {
      authAdapter: mockAuthAdapter,
      tokenStore: mockTokenStore,
    };
  });

  describe("exchangeCredential", () => {
    it("should exchange auth code for token and store it", async () => {
      const input: CredentialExchangeInput = {
        requestId: "req_001",
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        authCode: "auth_code_123",
        state: "state_456",
      };

      const result = await exchangeCredential(input, deps);

      expect(result.tokenStatus).toBe("ready");
      expect(result.userToken).toBe("user_token_456");
      expect(result.refreshToken).toBe("refresh_token_789");
      expect(mockAuthAdapter.getPluginToken).toHaveBeenCalledWith(input.baseUrl);
      expect(mockAuthAdapter.exchangeUserToken).toHaveBeenCalledWith({
        baseUrl: input.baseUrl,
        pluginToken: "plugin_token_123",
        authCode: input.authCode,
        state: input.state,
      });
      expect(mockTokenStore.save).toHaveBeenCalled();
    });

    it("should throw if auth adapter fails", async () => {
      vi.mocked(mockAuthAdapter.getPluginToken).mockRejectedValue(new Error("Plugin token failed"));

      const input: CredentialExchangeInput = {
        requestId: "req_001",
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        authCode: "auth_code_123",
      };

      await expect(exchangeCredential(input, deps)).rejects.toThrow("Plugin token failed");
    });
  });

  describe("refreshCredential", () => {
    it("should refresh token when refresh_token exists", async () => {
      // First, store a token
      const storedToken: StoredMeegleToken = {
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        userToken: "old_user_token",
        refreshToken: "old_refresh_token",
      };
      await mockTokenStore.save(storedToken);

      const result = await refreshCredential(
        {
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.tokenStatus).toBe("ready");
      expect(result.userToken).toBe("new_user_token_abc");
      expect(mockAuthAdapter.refreshUserToken).toHaveBeenCalledWith({
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        refreshToken: "old_refresh_token",
      });
    });

    it("should return require_auth_code when no stored token", async () => {
      const result = await refreshCredential(
        {
          operatorLarkId: "ou_unknown",
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
        operatorLarkId: "ou_xxx",
        meegleUserKey: "user_xxx",
        baseUrl: "https://project.larksuite.com",
        pluginToken: "plugin_token_123",
        userToken: "old_user_token",
        refreshToken: "old_refresh_token",
      };
      await mockTokenStore.save(storedToken);

      // Make refresh fail
      vi.mocked(mockAuthAdapter.refreshUserToken).mockRejectedValue(new Error("Refresh failed"));

      const result = await refreshCredential(
        {
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.tokenStatus).toBe("require_auth_code");
      expect(result.errorCode).toBe("MEEGLE_TOKEN_REFRESH_FAILED");
    });
  });
});