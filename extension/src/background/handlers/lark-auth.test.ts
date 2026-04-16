import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLarkOauthUrl,
  ensureLarkAuth,
  handleLarkAuthCallbackDetected,
  type EnsureLarkAuthDeps,
} from "./lark-auth.js";

describe("lark-auth handler", () => {
  let deps: EnsureLarkAuthDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      getCachedLarkToken: vi.fn().mockReturnValue(undefined),
      getAuthStatusFromServer: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          status: "require_auth",
          masterUserId: "usr_xxx",
          baseUrl: "https://open.larksuite.com",
          reason: "No stored Lark token found",
        },
      }),
      createOauthSessionWithServer: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          state: "state_123",
          baseUrl: "https://open.larksuite.com",
        },
      }),
      savePendingLarkOauthState: vi.fn(),
      saveLastLarkAuthResult: vi.fn(),
      clearPendingLarkOauthState: vi.fn(),
      openLarkOAuthTab: vi.fn(),
      appId: "cli_test",
    };
  });

  it("still opens oauth when the server requires auth even if local lark token cache exists", async () => {
    deps.getCachedLarkToken = vi.fn().mockReturnValue("cached_lark_token");

    const result = await ensureLarkAuth(
      {
        requestId: "req_001",
        masterUserId: "usr_xxx",
        baseUrl: "https://open.larksuite.com",
      },
      deps,
    );

    expect(result).toMatchObject({
      status: "in_progress",
      state: "state_123",
      baseUrl: "https://open.larksuite.com",
    });
    expect(deps.getAuthStatusFromServer).toHaveBeenCalledWith({
      masterUserId: "usr_xxx",
      baseUrl: "https://open.larksuite.com",
    });
    expect(deps.openLarkOAuthTab).toHaveBeenCalledWith(
      "https://open.larksuite.com",
      "state_123",
      "cli_test",
    );
  });

  it("creates a pending oauth session and opens the authorization tab when server requires auth", async () => {
    const result = await ensureLarkAuth(
      {
        requestId: "req_001",
        masterUserId: "usr_xxx",
        baseUrl: "https://foo.feishu.cn",
      },
      deps,
    );

    expect(result).toMatchObject({
      status: "in_progress",
      state: "state_123",
      baseUrl: "https://open.larksuite.com",
    });
    expect(deps.getAuthStatusFromServer).toHaveBeenCalledWith({
      masterUserId: "usr_xxx",
      baseUrl: "https://open.larksuite.com",
    });
    expect(deps.createOauthSessionWithServer).toHaveBeenCalledWith({
      masterUserId: "usr_xxx",
      baseUrl: "https://open.larksuite.com",
      state: expect.any(String),
    });
    expect(deps.savePendingLarkOauthState).toHaveBeenCalledWith({
      state: "state_123",
      masterUserId: "usr_xxx",
      baseUrl: "https://open.larksuite.com",
      startedAt: expect.any(String),
    });
    expect(deps.openLarkOAuthTab).toHaveBeenCalledWith(
      "https://open.larksuite.com",
      "state_123",
      "cli_test",
    );
  });

  it("stores callback completion and clears the pending oauth state", async () => {
    await handleLarkAuthCallbackDetected(
      {
        state: "state_123",
        status: "ready",
        masterUserId: "usr_xxx",
      },
      deps,
    );

    expect(deps.saveLastLarkAuthResult).toHaveBeenCalledWith({
      state: "state_123",
      status: "ready",
      masterUserId: "usr_xxx",
    });
    expect(deps.clearPendingLarkOauthState).toHaveBeenCalledWith("state_123");
  });

  it("builds the OAuth authorize URL against the accounts host", () => {
    const url = new URL(
      buildLarkOauthUrl(
        "https://open.larksuite.com",
        "state_123",
        "cli_test",
        "https://example.ngrok-free.app/api/lark/auth/callback",
        "offline_access contact:user.base:readonly bitable:app im:message.send_as_user im:message.reactions:write_only im:chat:readonly im:message",
      ),
    );

    expect(url.origin).toBe("https://accounts.larksuite.com");
    expect(url.pathname).toBe("/open-apis/authen/v1/authorize");
    expect(url.searchParams.get("app_id")).toBe("cli_test");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.ngrok-free.app/api/lark/auth/callback",
    );
    expect(url.searchParams.get("scope")).toBe(
      "offline_access contact:user.base:readonly bitable:app email",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});
