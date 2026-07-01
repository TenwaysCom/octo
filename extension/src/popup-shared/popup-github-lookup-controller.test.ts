import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../background/config.js", () => ({
  getConfig: vi.fn().mockResolvedValue({
    SERVER_URL: "http://localhost:3000",
  }),
}));

import {
  createGitHubLookupController,
  type GitHubLookupState,
} from "./popup-github-lookup-controller.js";

describe("popup github lookup controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes the current tab context before querying PR-linked workitems", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          prInfo: {
            title: "PR title",
            description: null,
            url: "https://github.com/TenwaysCom/Tenways/pull/123",
          },
          extractedIds: ["TEST-1"],
          workitems: [],
          notFound: [],
        },
      }),
    } as Response);

    let state: GitHubLookupState = {
      isLoading: false,
      error: null,
      result: null,
    };

    const controller = createGitHubLookupController({
      readStore: () => ({
        state: {
          currentUrl: "https://github.com/TenwaysCom/Tenways/pull/111",
          currentTabId: 12,
          currentTabOrigin: "https://github.com",
          identity: {
            masterUserId: "usr_123",
          },
        },
      }),
      queryCurrentTabContext: vi.fn().mockResolvedValue({
        id: 12,
        url: "https://github.com/TenwaysCom/Tenways/pull/123",
        origin: "https://github.com",
        pageType: "github",
      }),
      updateCurrentTabContext: vi.fn(),
      appendLog: vi.fn(),
      showToast: vi.fn(),
      setState: (next) => {
        state = typeof next === "function" ? next(state) : next;
      },
    });

    await controller.lookup({ actionRunId: "run_lookup_001" });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/github/lookup-meegle",
      expect.objectContaining({
        body: JSON.stringify({
          prUrl: "https://github.com/TenwaysCom/Tenways/pull/123",
          actionRunId: "run_lookup_001",
        }),
      }),
    );
    expect(state.result?.prInfo.url).toBe("https://github.com/TenwaysCom/Tenways/pull/123");
  });

  it("shows server envelope errors and preserves actionRunId in logs", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: {
          layer: "adapter",
          module: "github-reverse-lookup",
          stage: "server.workflow.failed",
          errorCode: "MEEGLE_AUTH_ERROR",
          errorMessage: "Token Info Is Invalid",
          actionRunId: "run_lookup_403",
          rawStatusCode: 403,
        },
      }),
    } as Response);

    let state: GitHubLookupState = {
      isLoading: false,
      error: null,
      result: null,
    };
    const appendLog = vi.fn();
    const showToast = vi.fn();

    const controller = createGitHubLookupController({
      readStore: () => ({
        state: {
          currentUrl: "https://github.com/TenwaysCom/Tenways/pull/111",
          currentTabId: 12,
          currentTabOrigin: "https://github.com",
          identity: {
            masterUserId: "usr_123",
          },
        },
      }),
      queryCurrentTabContext: vi.fn().mockResolvedValue({
        id: 12,
        url: "https://github.com/TenwaysCom/Tenways/pull/123",
        origin: "https://github.com",
        pageType: "github",
      }),
      updateCurrentTabContext: vi.fn(),
      appendLog,
      showToast,
      setState: (next) => {
        state = typeof next === "function" ? next(state) : next;
      },
    });

    await controller.lookup({ actionRunId: "run_lookup_403" });

    expect(state.error).toEqual({
      errorCode: "MEEGLE_AUTH_ERROR",
      errorMessage: "Token Info Is Invalid",
    });
    expect(appendLog).toHaveBeenCalledWith(
      "error",
      "查询失败: Token Info Is Invalid · actionRunId=run_lookup_403",
    );
    expect(showToast).toHaveBeenCalledWith("Token Info Is Invalid", "error");
  });
});
