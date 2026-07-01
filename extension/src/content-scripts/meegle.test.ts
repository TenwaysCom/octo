// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./meegle.js";
import { clearLogBuffer, getLogBuffer, setLogLevel } from "../logger.js";

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
      refreshMeegleSidebar: () => Promise<void>;
    };
  }).__TENWAYS_MEEGLE_TESTING__;
}

describe("meegle content script auth code fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    setLogLevel("info");
    delete (
      window as typeof window & {
        __MEEGLE_CONTEXT__?: unknown;
      }
    ).__MEEGLE_CONTEXT__;
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

  afterEach(() => {
    vi.useRealTimers();
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
    expect(getLogBuffer()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: "content-script:meegle",
          level: "debug",
          message: "meegleIdentity.resolve",
          detail: expect.objectContaining({
            source: "cookie",
            hasUserKey: true,
          }),
        }),
      ]),
    );
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
    expect(getLogBuffer()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: "content-script:meegle",
          level: "debug",
          message: "meegleIdentity.resolve",
          detail: expect.objectContaining({
            source: "context",
            hasUserKey: true,
          }),
        }),
      ]),
    );

    delete (
      window as typeof window & {
        __MEEGLE_CONTEXT__?: unknown;
      }
    ).__MEEGLE_CONTEXT__;
  });

  it("falls back to storage snapshots when runtime globals are missing", () => {
    localStorage.setItem(
      "meegle_user_profile",
      JSON.stringify({
        user_key: "user_from_storage",
        tenant_key: "tenant_from_storage",
        name: "Storage User",
      }),
    );

    expect(getTestingApi()?.getMeegleUserIdentity()).toEqual({
      userKey: "user_from_storage",
      userName: "Storage User",
      tenantKey: "tenant_from_storage",
    });
    expect(getLogBuffer()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: "content-script:meegle",
          level: "debug",
          message: "meegleIdentity.resolve",
          detail: expect.objectContaining({
            source: "storage",
            hasUserKey: true,
          }),
        }),
      ]),
    );
  });

  it("does not inject the sidebar on unmatched Meegle list routes", async () => {
    mockMeeglePageConfig();
    window.history.replaceState({}, "", "/4c3fv6/storyView/06pH6RuNRm");

    await getTestingApi()?.refreshMeegleSidebar();

    expect(document.getElementById("tenways-octo-sidebar-host")).toBeNull();
  });

  it("injects the sidebar after Meegle SPA navigation to a detail route", async () => {
    vi.useFakeTimers();
    mockMeeglePageConfig();
    window.history.replaceState({}, "", "/4c3fv6/storyView/06pH6RuNRm");
    await getTestingApi()?.refreshMeegleSidebar();

    window.history.pushState({}, "", "/4c3fv6/story/detail/10134234");
    await vi.advanceTimersByTimeAsync(150);

    const host = document.getElementById("tenways-octo-sidebar-host");
    expect(host?.shadowRoot?.querySelector(".octo-trigger")).not.toBeNull();
    const iframe = host?.shadowRoot?.querySelector(".octo-sidebar-iframe") as HTMLIFrameElement | null;
    expect(iframe?.getAttribute("src")).toContain("hostPageType=meegle");
    expect(iframe?.getAttribute("src")).toContain("meegleUserKey=user_from_storage");
  });

  it("removes the sidebar after Meegle SPA navigation back to an unmatched route", async () => {
    vi.useFakeTimers();
    mockMeeglePageConfig();
    window.history.replaceState({}, "", "/4c3fv6/story/detail/10134234");
    await getTestingApi()?.refreshMeegleSidebar();
    expect(document.getElementById("tenways-octo-sidebar-host")).not.toBeNull();

    window.history.pushState({}, "", "/4c3fv6/storyView/06pH6RuNRm");
    await vi.advanceTimersByTimeAsync(150);

    expect(document.getElementById("tenways-octo-sidebar-host")).toBeNull();
  });

  it("does not register duplicate auth listeners during repeated route refreshes", async () => {
    vi.useFakeTimers();
    mockMeeglePageConfig();
    const listenerCount = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.length;

    window.history.replaceState({}, "", "/4c3fv6/story/detail/10134234");
    await vi.advanceTimersByTimeAsync(150);
    window.history.pushState({}, "", "/4c3fv6/storyView/06pH6RuNRm");
    await vi.advanceTimersByTimeAsync(150);
    await getTestingApi()?.refreshMeegleSidebar();

    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(listenerCount);
  });
});

function mockMeeglePageConfig(): void {
  localStorage.setItem(
    "meegle_user_profile",
    JSON.stringify({
      user_key: "user_from_storage",
      tenant_key: "tenant_from_storage",
      name: "Storage User",
    }),
  );

  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/api/config/public")) {
      return jsonResponse({
        ok: true,
        data: {
          MEEGLE_BASE_URL: "https://project.larksuite.com",
        },
      });
    }

    if (requestUrl.includes("/api/config/page")) {
      const parsed = new URL(requestUrl);
      const pageUrl = new URL(parsed.searchParams.get("url") || "https://project.larksuite.com/");
      const isDetail = /^\/4c3fv6\/story\/detail\/\d+/.test(pageUrl.pathname);

      return jsonResponse({
        ok: true,
        data: {
          pageConfig: isDetail
            ? {
                platform: "meegle",
                pageType: "meegle_workitem_detail",
                matchedRuleId: "meegle.story.detail",
                matchedRuleIds: ["meegle.story.detail"],
                sidebar: {
                  injectPageElements: true,
                  sidebarButtonEnabled: true,
                  keyboardShortcutEnabled: true,
                },
                automationActions: [
                  {
                    key: "story-prd-to-simplified",
                    title: "研发Review Story",
                    style: "primary",
                    placements: [{ surface: "popup" }, { surface: "sidebar" }],
                    interaction: { type: "direct_execute" },
                    executor: {
                      type: "backend_api",
                      operation: "meegle.story.prd_to_simplified",
                      method: "POST",
                      route: "/api/meegle/workitem/story-prd-to-simplified",
                    },
                  },
                ],
              }
            : {
                platform: "meegle",
                pageType: "meegle",
                matchedRuleId: "meegle.unmatched",
                matchedRuleIds: [],
                sidebar: {
                  injectPageElements: false,
                  sidebarButtonEnabled: false,
                  keyboardShortcutEnabled: false,
                },
                automationActions: [],
              },
        },
      });
    }

    return jsonResponse({ ok: true, data: {} });
  });
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}
