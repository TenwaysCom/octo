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
    controller = new GitHubReverseLookupController(mockGitHubClient);
  });

  it("should lookup Meegle workitems from PR", async () => {
    mockGitHubClient.parsePrUrl.mockReturnValue({ owner: "org", repo: "repo", pullNumber: 123 });
    mockGitHubClient.getPullRequest.mockResolvedValue({ title: "Fix m-123", body: "Desc", html_url: "https://github.com/org/repo/pull/123" });
    mockGitHubClient.getCommits.mockResolvedValue([]);
    mockGitHubClient.getIssueComments.mockResolvedValue([]);
    mockGitHubClient.getReviewComments.mockResolvedValue([]);

    // First type returns empty, second type returns the workitem
    mockMeegleClient.filterWorkitemsAcrossProjects
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "123", name: "Test Item", type: "story", status: "open", fields: { project_key: "4c3fv6", field_1b9eb0: "v1.2", field_feb079: "Sprint 3" } },
      ]);

    const result = await controller.lookup("https://github.com/org/repo/pull/123", mockMeegleClient);

    expect(result.extractedIds).toEqual(["123"]);
    expect(result.workitems).toHaveLength(1);
    expect(result.workitems[0]).not.toHaveProperty("fields");
    expect(result.workitems[0].plannedVersion).toBe("v1.2");
    expect(result.workitems[0].plannedSprint).toBe("Sprint 3");
    expect(mockMeegleClient.filterWorkitemsAcrossProjects).toHaveBeenCalledTimes(2);

    // Verify workItemIds are passed as numbers
    const firstCall = mockMeegleClient.filterWorkitemsAcrossProjects.mock.calls[0][0];
    expect(firstCall.workItemIds).toEqual([123]);
  });

  it("should deduplicate workitems across types", async () => {
    mockGitHubClient.parsePrUrl.mockReturnValue({ owner: "org", repo: "repo", pullNumber: 123 });
    mockGitHubClient.getPullRequest.mockResolvedValue({ title: "Fix m-123", body: "Desc", html_url: "https://github.com/org/repo/pull/123" });
    mockGitHubClient.getCommits.mockResolvedValue([]);
    mockGitHubClient.getIssueComments.mockResolvedValue([]);
    mockGitHubClient.getReviewComments.mockResolvedValue([]);

    // Both types return the same workitem
    mockMeegleClient.filterWorkitemsAcrossProjects
      .mockResolvedValueOnce([
        { id: "123", name: "Test Item", type: "story", status: "open", fields: { project_key: "4c3fv6", field_1b9eb0: "v1.2", field_feb079: "Sprint 3" } },
      ])
      .mockResolvedValueOnce([
        { id: "123", name: "Test Item", type: "story", status: "open", fields: { project_key: "4c3fv6", field_1b9eb0: "v1.2", field_feb079: "Sprint 3" } },
      ]);

    const result = await controller.lookup("https://github.com/org/repo/pull/123", mockMeegleClient);

    expect(result.workitems).toHaveLength(1);
  });

  it("should extract plannedVersion and plannedSprint from nested fields array with number values", async () => {
    mockGitHubClient.parsePrUrl.mockReturnValue({ owner: "org", repo: "repo", pullNumber: 123 });
    mockGitHubClient.getPullRequest.mockResolvedValue({ title: "Fix m-11666660", body: "Desc", html_url: "https://github.com/org/repo/pull/123" });
    mockGitHubClient.getCommits.mockResolvedValue([]);
    mockGitHubClient.getIssueComments.mockResolvedValue([]);
    mockGitHubClient.getReviewComments.mockResolvedValue([]);

    // Real API response format: fields.fields[] with number field_value
    mockMeegleClient.filterWorkitemsAcrossProjects.mockResolvedValueOnce([
      {
        id: "11666660",
        name: "Test Item",
        type: "story",
        status: "",
        fields: {
          project_key: "68a2ed80e4ff51e07a71a6f6",
          fields: [
            { field_key: "field_1b9eb0", field_value: 11510275, field_type_key: "work_item_related_select" },
            { field_key: "field_feb079", field_value: 11498101, field_type_key: "work_item_related_select" },
          ],
        },
      },
    ]).mockResolvedValueOnce([]);

    const result = await controller.lookup("https://github.com/org/repo/pull/123", mockMeegleClient);

    expect(result.workitems).toHaveLength(1);
    expect(result.workitems[0].plannedVersion).toBe("11510275");
    expect(result.workitems[0].plannedSprint).toBe("11498101");
    expect(result.workitems[0].url).toContain("/story/detail/11666660");
  });

  it("should handle type query failures gracefully", async () => {
    mockGitHubClient.parsePrUrl.mockReturnValue({ owner: "org", repo: "repo", pullNumber: 123 });
    mockGitHubClient.getPullRequest.mockResolvedValue({ title: "Fix m-123", body: "Desc", html_url: "https://github.com/org/repo/pull/123" });
    mockGitHubClient.getCommits.mockResolvedValue([]);
    mockGitHubClient.getIssueComments.mockResolvedValue([]);
    mockGitHubClient.getReviewComments.mockResolvedValue([]);

    // First type throws, second type succeeds
    mockMeegleClient.filterWorkitemsAcrossProjects
      .mockRejectedValueOnce(new Error("Invalid type"))
      .mockResolvedValueOnce([
        { id: "123", name: "Test Item", type: "story", status: "open", fields: { project_key: "4c3fv6", field_1b9eb0: "v1.2", field_feb079: "Sprint 3" } },
      ]);

    const result = await controller.lookup("https://github.com/org/repo/pull/123", mockMeegleClient);

    expect(result.workitems).toHaveLength(1);
    expect(mockMeegleClient.filterWorkitemsAcrossProjects).toHaveBeenCalledTimes(2);
  });
});
