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

  it("should lookup Meegle workitems from PR with string field values", async () => {
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
    expect(result.workitems[0].type).toBe("story");
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

  it("should map production_bug type key to readable name", async () => {
    mockGitHubClient.parsePrUrl.mockReturnValue({ owner: "org", repo: "repo", pullNumber: 123 });
    mockGitHubClient.getPullRequest.mockResolvedValue({ title: "Fix m-123", body: "Desc", html_url: "https://github.com/org/repo/pull/123" });
    mockGitHubClient.getCommits.mockResolvedValue([]);
    mockGitHubClient.getIssueComments.mockResolvedValue([]);
    mockGitHubClient.getReviewComments.mockResolvedValue([]);

    mockMeegleClient.filterWorkitemsAcrossProjects
      .mockResolvedValueOnce([
        { id: "123", name: "Bug Fix", type: "6932e40429d1cd8aac635c82", status: "open", fields: { project_key: "4c3fv6" } },
      ])
      .mockResolvedValueOnce([]);

    const result = await controller.lookup("https://github.com/org/repo/pull/123", mockMeegleClient);

    expect(result.workitems[0].type).toBe("production_bug");
    expect(result.workitems[0].url).toContain("/production_bug/detail/123");
  });

  it("should resolve related workitem names for number field values", async () => {
    mockGitHubClient.parsePrUrl.mockReturnValue({ owner: "org", repo: "repo", pullNumber: 123 });
    mockGitHubClient.getPullRequest.mockResolvedValue({ title: "Fix m-11666660", body: "Desc", html_url: "https://github.com/org/repo/pull/123" });
    mockGitHubClient.getCommits.mockResolvedValue([]);
    mockGitHubClient.getIssueComments.mockResolvedValue([]);
    mockGitHubClient.getReviewComments.mockResolvedValue([]);

    // 1st call: main query for story type
    // 2nd call: main query for production_bug type (empty)
    // 3rd call: related version query
    // 4th call: related sprint query
    mockMeegleClient.filterWorkitemsAcrossProjects
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "11510275", name: "v2.5.0", type: "version", status: "", fields: {} },
      ])
      .mockResolvedValueOnce([
        { id: "11498101", name: "Sprint 42", type: "sprint", status: "", fields: {} },
      ]);

    const result = await controller.lookup("https://github.com/org/repo/pull/123", mockMeegleClient);

    expect(result.workitems).toHaveLength(1);
    expect(result.workitems[0].plannedVersion).toBe("v2.5.0");
    expect(result.workitems[0].plannedSprint).toBe("Sprint 42");
    expect(result.workitems[0].url).toContain("/story/detail/11666660");

    // Verify version IDs were passed to the 3rd call (with version type key)
    const versionCall = mockMeegleClient.filterWorkitemsAcrossProjects.mock.calls[2][0];
    expect(versionCall.workItemIds).toEqual([11510275]);
    expect(versionCall.workitemTypeKey).toBe("642f8d55c7109143ec2eb478");

    // Verify sprint IDs were passed to the 4th call (with sprint type key)
    const sprintCall = mockMeegleClient.filterWorkitemsAcrossProjects.mock.calls[3][0];
    expect(sprintCall.workItemIds).toEqual([11498101]);
    expect(sprintCall.workitemTypeKey).toBe("642ebe04168eea39eeb0d34a");
  });

  it("should fallback to raw IDs when related workitem name resolution fails", async () => {
    mockGitHubClient.parsePrUrl.mockReturnValue({ owner: "org", repo: "repo", pullNumber: 123 });
    mockGitHubClient.getPullRequest.mockResolvedValue({ title: "Fix m-11666660", body: "Desc", html_url: "https://github.com/org/repo/pull/123" });
    mockGitHubClient.getCommits.mockResolvedValue([]);
    mockGitHubClient.getIssueComments.mockResolvedValue([]);
    mockGitHubClient.getReviewComments.mockResolvedValue([]);

    mockMeegleClient.filterWorkitemsAcrossProjects
      .mockResolvedValueOnce([
        {
          id: "11666660",
          name: "Test Item",
          type: "story",
          status: "",
          fields: {
            project_key: "68a2ed80e4ff51e07a71a6f6",
            fields: [
              { field_key: "field_1b9eb0", field_value: 11510275, field_type_key: "work_item_related_select" },
            ],
          },
        },
      ])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Version query failed"));

    const result = await controller.lookup("https://github.com/org/repo/pull/123", mockMeegleClient);

    expect(result.workitems[0].plannedVersion).toBe("11510275");
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
