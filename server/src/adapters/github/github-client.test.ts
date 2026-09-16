import { describe, it, expect, beforeEach, vi } from "vitest";
import { GitHubClient } from "./github-client.js";

describe("GitHubClient", () => {
  let client: GitHubClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new GitHubClient({ token: "test-token", fetch: mockFetch });
  });

  describe("parsePrUrl", () => {
    it("should parse valid GitHub PR URL", () => {
      const result = client.parsePrUrl("https://github.com/owner/repo/pull/123");
      expect(result).toEqual({ owner: "owner", repo: "repo", pullNumber: 123 });
    });

    it("should throw for invalid URL", () => {
      expect(() => client.parsePrUrl("https://example.com/invalid")).toThrow("INVALID_PR_URL");
    });
  });

  describe("parseWorkItemUrl", () => {
    it("should parse valid GitHub issue URL", () => {
      const result = client.parseWorkItemUrl("https://github.com/TenwaysCom/octo/issues/35");
      expect(result).toEqual({
        kind: "issue",
        owner: "TenwaysCom",
        repo: "octo",
        number: 35,
      });
    });
  });

  describe("getPullRequest", () => {
    it("should fetch PR details", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: "Fix bug", body: "Description" }),
      });

      const result = await client.getPullRequest("owner", "repo", 123);
      expect(result.title).toBe("Fix bug");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls/123",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });
  });

  it("patches a pull request title", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: "Fix bug m-123", body: null }),
    });

    await expect(client.updatePullRequestTitle("owner", "repo", 123, "Fix bug m-123", { actionRunId: "action-1" }))
      .resolves.toMatchObject({ title: "Fix bug m-123" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/pulls/123",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "Fix bug m-123" }) }),
    );
  });

  it("searches incrementally updated pull requests in ascending update order", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        total_count: 1,
        incomplete_results: false,
        items: [{ number: 12, updated_at: "2026-08-12T00:01:00Z" }],
      }),
    });

    await expect(client.listPullRequestsUpdatedSince("owner", "repo", "2026-08-12T00:00:00Z"))
      .resolves.toEqual([{ number: 12, updated_at: "2026-08-12T00:01:00Z" }]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/search/issues?q=repo%3Aowner%2Frepo%20is%3Apr%20updated%3A%3E%3D2026-08-12T00%3A00%3A00.000Z&sort=updated&order=asc"),
      expect.anything(),
    );
  });

  it("fetches paginated PR files and posts a PR comment", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ filename: "Tenways/tw_sale/models/sale.py", patch: "+pass" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, html_url: "https://github.com/owner/repo/pull/123#issuecomment-1" }),
      });

    await expect(client.getPullRequestFiles("owner", "repo", 123)).resolves.toHaveLength(1);
    await expect(client.createPullRequestComment("owner", "repo", 123, "review")).resolves.toMatchObject({ id: 1 });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/owner/repo/pulls/123/files?per_page=100&page=1",
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/owner/repo/issues/123/comments",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ body: "review" }) }),
    );
  });

  describe("getIssue", () => {
    it("should fetch issue details", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: "Issue m-35", body: "Description" }),
      });

      const result = await client.getIssue("owner", "repo", 35);
      expect(result.title).toBe("Issue m-35");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/issues/35",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });
  });

  describe("createBranch", () => {
    it("should create a branch from main", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ref: "refs/heads/main",
            object: { sha: "abc123", type: "commit", url: "" },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ref: "refs/heads/feat/test-branch",
            object: { sha: "abc123", type: "commit", url: "" },
          }),
        });

      const result = await client.createBranch("owner", "repo", "feat/test-branch");
      expect(result.ref).toBe("refs/heads/feat/test-branch");

      // First call: GET base branch ref
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "https://api.github.com/repos/owner/repo/git/ref/heads/main",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );

      // Second call: POST new ref
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "https://api.github.com/repos/owner/repo/git/refs",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ ref: "refs/heads/feat/test-branch", sha: "abc123" }),
        })
      );
    });

    it("should throw on GitHub API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ref: "refs/heads/main",
          object: { sha: "abc123", type: "commit", url: "" },
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => "Reference already exists",
      });

      await expect(client.createBranch("owner", "repo", "existing-branch")).rejects.toThrow("GitHub API error");
    });
  });
});
