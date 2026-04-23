import { logger } from "../../logger.js";
import type { GitHubPrDetails, GitHubCommit, GitHubComment, ParsedPrUrl } from "./github-types.js";

const githubLogger = logger.child({ module: "github-client" });

const GITHUB_API_BASE = "https://api.github.com";

export interface GitHubClientOptions {
  token: string;
  fetch?: typeof fetch;
}

export class GitHubClient {
  private token: string;
  private fetch: typeof fetch;

  constructor(options: GitHubClientOptions) {
    this.token = options.token;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  parsePrUrl(url: string): ParsedPrUrl {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      const error = new Error("INVALID_PR_URL");
      (error as Error & { code: string }).code = "INVALID_PR_URL";
      throw error;
    }
    return {
      owner: match[1],
      repo: match[2],
      pullNumber: parseInt(match[3], 10),
    };
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${GITHUB_API_BASE}${path}`;
    githubLogger.debug({ url }, "GitHub API request");

    const response = await this.fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Octo-Extension",
      },
    });

    if (!response.ok) {
      const error = new Error(`GitHub API error: ${response.status}`);
      (error as Error & { code: string; status: number }).code = "GITHUB_API_ERROR";
      (error as Error & { status: number }).status = response.status;
      throw error;
    }

    return response.json() as Promise<T>;
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<GitHubPrDetails> {
    return this.request<GitHubPrDetails>(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
  }

  async getCommits(owner: string, repo: string, pullNumber: number): Promise<GitHubCommit[]> {
    return this.request<GitHubCommit[]>(`/repos/${owner}/${repo}/pulls/${pullNumber}/commits`);
  }

  async getIssueComments(owner: string, repo: string, pullNumber: number): Promise<GitHubComment[]> {
    return this.request<GitHubComment[]>(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`);
  }

  async getReviewComments(owner: string, repo: string, pullNumber: number): Promise<GitHubComment[]> {
    return this.request<GitHubComment[]>(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`);
  }
}
