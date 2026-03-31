// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import "./meegle.js";

function getTestingApi() {
  return (globalThis as typeof globalThis & {
    __TENWAYS_MEEGLE_TESTING__?: {
      getMeegleUserIdentity: () => {
        userKey: string | null;
        userName: string | null;
        tenantKey: string | null;
      };
      getAuthCodeFromMeegleApi: (
        pluginId: string,
        state: string,
        baseUrl?: string,
      ) => Promise<{
        authCode: string;
        state: string;
        issuedAt: string;
      } | null>;
    };
  }).__TENWAYS_MEEGLE_TESTING__;
}

describe("meegle content script auth code fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const [name] = part.split("=");
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });
  });

  it("uses the current page origin and returns an auth code", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { code: "auth_code_123" },
      }),
    } as Response);

    await expect(
      getTestingApi()?.getAuthCodeFromMeegleApi(
        "PLUGIN_123",
        "state_123",
        "https://tenant.meegle.com",
      ),
    ).resolves.toMatchObject({
      authCode: "auth_code_123",
      state: "state_123",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://tenant.meegle.com/bff/v2/authen/v1/auth_code",
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });

  it("throws the API error details when auth code acquisition fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        error: { code: 401, msg: "login required" },
      }),
    } as Response);

    await expect(
      getTestingApi()?.getAuthCodeFromMeegleApi(
        "PLUGIN_123",
        "state_123",
        "https://tenant.meegle.com",
      ),
    ).rejects.toThrow("login required");
  });

  it("falls back to cookie values when meegle user identity is not exposed elsewhere", () => {
    document.cookie = "meego_user_key=7538275242901291040; path=/";
    document.cookie = "meego_tenant_key=saas_7538275207677476895; path=/";

    expect(getTestingApi()?.getMeegleUserIdentity()).toEqual({
      userKey: "7538275242901291040",
      userName: null,
      tenantKey: "saas_7538275207677476895",
    });
  });

  it("prefers page context over cookie values when both exist", () => {
    document.cookie = "meego_user_key=7538275242901291040; path=/";

    (
      window as typeof window & {
        __MEEGLE_CONTEXT__?: {
          user?: {
            userKey?: string;
            name?: string;
            tenantKey?: string;
          };
        };
      }
    ).__MEEGLE_CONTEXT__ = {
      user: {
        userKey: "user_from_context",
        name: "Ben LIN",
        tenantKey: "tenant_from_context",
      },
    };

    expect(getTestingApi()?.getMeegleUserIdentity()).toEqual({
      userKey: "user_from_context",
      userName: "Ben LIN",
      tenantKey: "tenant_from_context",
    });

    delete (
      window as typeof window & {
        __MEEGLE_CONTEXT__?: unknown;
      }
    ).__MEEGLE_CONTEXT__;
  });
});
