import { describe, it, expect, beforeEach, vi } from "vitest";
import { GitHubReverseLookupController } from "./github-reverse-lookup.js";

describe("GitHubReverseLookupController", () => {
  let controller: GitHubReverseLookupController;
  let mockGitHubClient: any;
  let mockMeegleClient: any;

  beforeEach(() => {
    mockGitHubClient = {
      parsePrUrl: vi.fn(),
      getPullRequest: vi.fn(),
      getCommits: vi.fn(),
      getIssueComments: vi.fn(),
      getReviewComments: vi.fn(),
    };
    mockMeegleClient = {
      filterWorkitemsAcrossProjects: vi.fn(),
    };
    controller = new GitHubReverseLookupController(mockGitHubClient, mockMeegleClient);
  });

  it("should lookup Meegle workitems from PR", async () => {
    mockGitHubClient.parsePrUrl.mockReturnValue({ owner: "org", repo: "repo", pullNumber: 123 });
    mockGitHubClient.getPullRequest.mockResolvedValue({ title: "Fix m-123", body: "Desc", html_url: "https://github.com/org/repo/pull/123" });
    mockGitHubClient.getCommits.mockResolvedValue([]);
    mockGitHubClient.getIssueComments.mockResolvedValue([]);
    mockGitHubClient.getReviewComments.mockResolvedValue([]);
    mockMeegleClient.filterWorkitemsAcrossProjects.mockResolvedValue([
      { id: "123", name: "Test Item", type: "story", status: "open" },
    ]);

    const result = await controller.lookup("https://github.com/org/repo/pull/123");

    expect(result.extractedIds).toEqual(["123"]);
    expect(result.workitems).toHaveLength(1);
  });
});
