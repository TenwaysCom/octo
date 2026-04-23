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
