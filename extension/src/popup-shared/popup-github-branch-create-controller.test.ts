import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../background/config.js", () => ({
  getConfig: vi.fn().mockResolvedValue({
    SERVER_URL: "http://localhost:3000",
  }),
}));

import { createGitHubBranchCreateController } from "./popup-github-branch-create-controller.js";

describe("popup github branch create controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes the current tab context before opening the preview", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        repo: "TenwaysCom/Tenways",
        defaultBranchName: "feat/20260424-m-11237978-fix-bug",
        workItemTitle: "Fix bug",
        systemValue: "ihib59zp4",
        systemLabel: "Odoo EU",
      }),
    } as Response);

    let state = {
      visible: false,
      stage: "preview",
      repo: "",
      defaultBranchName: "",
      editedBranchName: "",
      workItemTitle: "",
      systemLabel: "",
      error: null,
      result: null,
    } as const;

    const controller = createGitHubBranchCreateController({
      readStore: () => ({
        state: {
          currentUrl: "https://project.larksuite.com/4c3fv6/story/detail/11770337",
          currentTabId: 12,
          currentTabOrigin: "https://project.larksuite.com",
          identity: {
            masterUserId: "usr_123",
          },
        },
      }),
      queryCurrentTabContext: vi.fn().mockResolvedValue({
        id: 12,
        url: "https://project.larksuite.com/4c3fv6/production_bug/detail/11237978",
        origin: "https://project.larksuite.com",
        pageType: "meegle",
      }),
      updateCurrentTabContext: vi.fn(),
      appendLog: vi.fn(),
      showToast: vi.fn(),
      setModalState: (next) => {
        state = typeof next === "function" ? next(state) : next;
      },
    });

    await controller.open();

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/github/branch/preview",
      expect.objectContaining({
        body: JSON.stringify({
          projectKey: "4c3fv6",
          workItemTypeKey: "production_bug",
          workItemId: "11237978",
          masterUserId: "usr_123",
          baseUrl: "https://project.larksuite.com",
        }),
      }),
    );
    expect(state.visible).toBe(true);
  });
});
