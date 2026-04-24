import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../background/config.js", () => ({
  getConfig: vi.fn().mockResolvedValue({
    SERVER_URL: "http://localhost:3000",
  }),
}));

import { createGitHubLookupController } from "./popup-github-lookup-controller.js";

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

    let state = {
      isLoading: false,
      error: null,
      result: null,
    } as const;

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

    await controller.lookup();

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/github/lookup-meegle",
      expect.objectContaining({
        body: JSON.stringify({
          prUrl: "https://github.com/TenwaysCom/Tenways/pull/123",
        }),
      }),
    );
    expect(state.result?.prInfo.url).toBe("https://github.com/TenwaysCom/Tenways/pull/123");
  });
});
