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
          baseUrl: "https://project.larksuite.com",
          state: "state_456",
        },
        deps,
      );

      expect(result.status).toBe("ready");
      expect(result.authCode).toBe("auth_code_123");
      expect(deps.exchangeAuthCodeWithServer).toHaveBeenCalledWith(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
          state: "state_456",
        },
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
          baseUrl: "https://project.larksuite.com",
          state: "state_456",
        },
        deps,
      );

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("MEEGLE_TOKEN_EXCHANGE_FAILED");
    });

    it("should return require_auth_code when no Meegle tab", async () => {
      deps.requestAuthCodeFromContentScript = vi.fn().mockResolvedValue(undefined);

      const result = await ensureMeegleAuth(
        {
          requestId: "req_001",
          operatorLarkId: "ou_xxx",
          meegleUserKey: "user_xxx",
          baseUrl: "https://project.larksuite.com",
        },
        deps,
      );

      expect(result.status).toBe("require_auth_code");
      expect(result.reason).toBe("NEED_USER_LOGIN");
      expect(deps.openMeegleLoginTab).toHaveBeenCalled();
    });
  });
});