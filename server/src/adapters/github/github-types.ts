export interface GitHubPrDetails {
  title: string;
  body: string | null;
  number: number;
  html_url: string;
}

export interface GitHubCommit {
  commit: {
    message: string;
  };
  sha: string;
}

export interface GitHubComment {
  body: string;
  user: { login: string };
  created_at: string;
}

export interface ParsedPrUrl {
  owner: string;
  repo: string;
  pullNumber: number;
}
