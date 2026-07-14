import { logger } from "../../logger.js";
import type {
  GitHubPrDetails,
  GitHubIssueDetails,
  GitHubCommit,
  GitHubComment,
  GitHubIssueCommentCreated,
  GitHubPullRequestFile,
  ParsedPrUrl,
  ParsedGitHubWorkItemUrl,
  GitHubRef,
} from "./github-types.js";

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

  parseWorkItemUrl(url: string): ParsedGitHubWorkItemUrl {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/);
    if (!match) {
      const error = new Error("INVALID_PR_URL");
      (error as Error & { code: string }).code = "INVALID_PR_URL";
      throw error;
    }

    return {
      kind: match[3] === "pull" ? "pull" : "issue",
      owner: match[1],
      repo: match[2],
      number: parseInt(match[4], 10),
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

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssueDetails> {
    return this.request<GitHubIssueDetails>(`/repos/${owner}/${repo}/issues/${issueNumber}`);
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

  async getPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GitHubPullRequestFile[]> {
    const files: GitHubPullRequestFile[] = [];
    for (let page = 1; ; page += 1) {
      const batch = await this.request<GitHubPullRequestFile[]>(
        `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`,
      );
      files.push(...batch);
      if (batch.length < 100) {
        return files;
      }
    }
  }

  async createPullRequestComment(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string,
  ): Promise<GitHubIssueCommentCreated> {
    return this.post<GitHubIssueCommentCreated>(
      `/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
      { body },
    );
  }

  async createBranch(owner: string, repo: string, branchName: string, baseBranch = "main"): Promise<GitHubRef> {
    // 1. Get base branch SHA
    const baseRef = await this.request<GitHubRef>(`/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`);
    const sha = baseRef.object.sha;

    githubLogger.info({ owner, repo, branchName, baseBranch, sha }, "GitHub create branch");

    // 2. Create new ref
    return this.post<GitHubRef>(`/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha,
    });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${GITHUB_API_BASE}${path}`;
    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Octo-Extension",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "unknown");
      const error = new Error(`GitHub API error: ${response.status} - ${errorBody}`);
      (error as Error & { code: string; status: number }).code = "GITHUB_API_ERROR";
      (error as Error & { status: number }).status = response.status;
      throw error;
    }

    return response.json() as Promise<T>;
  }
}
