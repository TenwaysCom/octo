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
});
