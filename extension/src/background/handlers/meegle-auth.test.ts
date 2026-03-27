import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureMeegleAuth, type EnsureMeegleAuthDeps } from "./meegle-auth.js";
import type { MeegleAuthCodeResponse, MeegleAuthExchangeResponse } from "../../types/meegle.js";

// Mock the config
vi.mock("../config.js", () => ({
  getConfig: vi.fn().mockResolvedValue({
    SERVER_URL: "http://localhost:3000",
    MEEGLE_PLUGIN_ID: "MII_TEST_PLUGIN",
    MEEGLE_BASE_URL: "https://project.larksuite.com",
    LARK_APP_ID: "cli_test",
  }),
}));

describe("meegle-auth handler", () => {
  let deps: EnsureMeegleAuthDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = undefined;
    deps = {
      getCachedToken: vi.fn().mockReturnValue(undefined),
      getCachedPluginId: vi.fn().mockReturnValue("MII_TEST_PLUGIN"),
      saveAuthCode: vi.fn(),
      requestAuthCodeFromContentScript: vi.fn(),
      openMeegleLoginTab: vi.fn(),
      exchangeAuthCodeWithServer: vi.fn(),
    };
  });

  describe("ensureMeegleAuth", () => {
    it("should return ready when cached token exists", async () => {
      deps.getCachedToken = vi.fn().mockReturnValue("existing_token");

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.status).toBe("ready");
      expect(deps.getCachedToken).toHaveBeenCalled();
    });

    it("should return failed when required fields missing", async () => {
      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          // missing operatorLarkId and meegleUserKey
        },
        deps,
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("MEEGLE_AUTH_REQUIRED_FIELDS_MISSING");
    });

    it("should return failed when plugin ID not configured", async () => {
      deps.getCachedPluginId = vi.fn().mockReturnValue(undefined);

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("PLUGIN_ID_NOT_CONFIGURED");
    });

    it("should reject the placeholder plugin ID before calling Meegle", async () => {
      deps.getCachedPluginId = vi.fn().mockReturnValue("your-plugin-id");

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("PLUGIN_ID_NOT_CONFIGURED");
      expect(deps.requestAuthCodeFromContentScript).not.toHaveBeenCalled();
    });

    it("should complete full auth flow with exchange", async () => {
      const mockAuthCode: MeegleAuthCodeResponse = {
        authCode: "auth_code_123",
        state: "state_456",
        issuedAt: new Date().toISOString(),
      };

      const mockExchangeResponse: MeegleAuthExchangeResponse = {
        ok: true,
        data: {
          tokenStatus: "ready",
          credentialStatus: "active",
        },
      };

      deps.requestAuthCodeFromContentScript = vi.fn().mockResolvedValue(mockAuthCode);
      deps.exchangeAuthCodeWithServer = vi.fn().mockResolvedValue(mockExchangeResponse);

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          baseUrl: "https://project.larksuite.com",
          state: "state_456",
        },
        deps,
      );

      expect(result.status).toBe("ready");
      expect(result.authCode).toBe("auth_code_123");
      expect(deps.saveAuthCode).toHaveBeenCalledWith(mockAuthCode);
      expect(deps.exchangeAuthCodeWithServer).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
          state: "state_456",
        }),
        "auth_code_123",
      );
    });

    it("should fail on state mismatch", async () => {
      const mockAuthCode: MeegleAuthCodeResponse = {
        authCode: "auth_code_123",
        state: "wrong_state",
        issuedAt: new Date().toISOString(),
      };

      deps.requestAuthCodeFromContentScript = vi.fn().mockResolvedValue(mockAuthCode);

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          baseUrl: "https://project.larksuite.com",
          state: "expected_state",
        },
        deps,
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("MEEGLE_AUTH_CODE_STATE_MISMATCH");
    });

    it("should fail when exchange fails", async () => {
      const mockAuthCode: MeegleAuthCodeResponse = {
        authCode: "auth_code_123",
        state: "state_456",
        issuedAt: new Date().toISOString(),
      };

      const mockExchangeResponse: MeegleAuthExchangeResponse = {
        ok: false,
        error: {
          errorCode: "MEEGLE_TOKEN_EXCHANGE_FAILED",
          errorMessage: "Exchange failed",
        },
      };

      deps.requestAuthCodeFromContentScript = vi.fn().mockResolvedValue(mockAuthCode);
      deps.exchangeAuthCodeWithServer = vi.fn().mockResolvedValue(mockExchangeResponse);

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          baseUrl: "https://project.larksuite.com",
          state: "state_456",
        },
        deps,
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("MEEGLE_AUTH_CODE_EXCHANGE_FAILED");
      expect(result.errorMessage).toBe("Exchange failed");
    });

    it("should normalize server internal exchange errors into an exchange failure for the popup", async () => {
      const mockAuthCode: MeegleAuthCodeResponse = {
        authCode: "auth_code_123",
        state: "state_456",
        issuedAt: new Date().toISOString(),
      };

      const mockExchangeResponse: MeegleAuthExchangeResponse = {
        ok: false,
        error: {
          errorCode: "INTERNAL_ERROR",
          errorMessage: "Missing token field: plugin_access_token, token, access_token",
        },
      };

      deps.requestAuthCodeFromContentScript = vi.fn().mockResolvedValue(mockAuthCode);
      deps.exchangeAuthCodeWithServer = vi.fn().mockResolvedValue(mockExchangeResponse);

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          baseUrl: "https://project.larksuite.com",
          state: "state_456",
        },
        deps,
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("MEEGLE_AUTH_CODE_EXCHANGE_FAILED");
      expect(result.errorMessage).toContain("Missing token field");
    });

    it("should surface network errors when the server exchange request itself fails", async () => {
      const mockAuthCode: MeegleAuthCodeResponse = {
        authCode: "auth_code_123",
        state: "state_456",
        issuedAt: new Date().toISOString(),
      };

      deps.requestAuthCodeFromContentScript = vi.fn().mockResolvedValue(mockAuthCode);
      delete deps.exchangeAuthCodeWithServer;
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Failed to fetch"));

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          baseUrl: "https://project.larksuite.com",
          state: "state_456",
        },
        deps,
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("MEEGLE_AUTH_CODE_EXCHANGE_FAILED");
      expect(result.errorMessage).toContain("Failed to reach http://localhost:3000");
      expect(result.errorMessage).toContain("Failed to fetch");
    });
    it("should return require_auth_code when no Meegle tab", async () => {
      deps.requestAuthCodeFromContentScript = vi.fn().mockResolvedValue(undefined);

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.status).toBe("require_auth_code");
      expect(result.reason).toBe("NEED_USER_LOGIN");
      expect(deps.openMeegleLoginTab).toHaveBeenCalled();
    });

    it("should require a Meegle page when the current tab is not a Meegle page", async () => {
      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          currentTabId: 12,
          currentPageIsMeegle: false,
          baseUrl: "https://www.larksuite.com",
        },
        deps,
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("MEEGLE_PAGE_REQUIRED");
      expect(deps.requestAuthCodeFromContentScript).not.toHaveBeenCalled();
    });

    it("should allow auth code acquisition before meegleUserKey is available", async () => {
      const mockAuthCode: MeegleAuthCodeResponse = {
        authCode: "auth_code_123",
        state: "state_456",
        issuedAt: new Date().toISOString(),
      };

      deps.requestAuthCodeFromContentScript = vi.fn().mockResolvedValue(mockAuthCode);

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          baseUrl: "https://tenant.meegle.com",
          state: "state_456",
        },
        deps,
      );

      expect(result.authCode).toBe("auth_code_123");
      expect(deps.saveAuthCode).toHaveBeenCalledWith(mockAuthCode);
      expect(result.reason).toBe("MEEGLE_USER_KEY_REQUIRED");
      expect(result.credentialStatus).toBe("auth_code_received");
    });

    it("should surface auth code request failures instead of pretending the user is logged out", async () => {
      deps.requestAuthCodeFromContentScript = vi
        .fn()
        .mockRejectedValue(new Error("plugin id is invalid"));

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          meegleUserKey: "user_xxx",
          baseUrl: "https://tenant.meegle.com",
          state: "state_456",
        },
        deps,
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("AUTH_CODE_REQUEST_FAILED");
      expect(result.errorMessage).toContain("plugin id is invalid");
    });

    it("should fail fast when the current tab has no Meegle content script receiver", async () => {
      const sendMessage = chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>;
      const executeScript = chrome.scripting.executeScript as unknown as ReturnType<typeof vi.fn>;

      sendMessage.mockImplementation((_tabId, _message, callback) => {
        chrome.runtime.lastError = {
          message: "Could not establish connection. Receiving end does not exist.",
        } as chrome.runtime.LastError;
        callback?.(undefined);
      });

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          currentTabId: 12,
          currentPageIsMeegle: true,
          baseUrl: "https://tenant.meegle.com",
          state: "state_456",
        },
        {
          getCachedToken: vi.fn().mockReturnValue(undefined),
          getCachedPluginId: vi.fn().mockReturnValue("MII_TEST_PLUGIN"),
          saveAuthCode: vi.fn(),
          exchangeAuthCodeWithServer: vi.fn(),
        },
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("MEEGLE_PAGE_REQUIRED");
      expect(result.errorMessage).toContain("Receiving end does not exist");
      expect(executeScript).not.toHaveBeenCalled();
    });

  });
});
