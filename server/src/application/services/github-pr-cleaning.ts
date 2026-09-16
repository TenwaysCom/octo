import type { GitHubPrDetails } from "../../adapters/github/github-types.js";

export interface GitHubPrCleaningProjection {
  author?: string;
  mergedBy?: string;
  reviewers: string[];
  labels: string[];
  createdAt?: string;
}

export function buildGitHubPrCleaningProjection(
  pullRequest: GitHubPrDetails | undefined,
  fallbackAuthor?: string,
): GitHubPrCleaningProjection {
  return {
    author: pullRequest?.user?.login ?? fallbackAuthor,
    mergedBy: pullRequest?.merged_by?.login,
    reviewers: uniqueLogins(pullRequest?.requested_reviewers),
    labels: uniqueNames(pullRequest?.labels),
    createdAt: pullRequest?.created_at,
  };
}

function uniqueLogins(users: Array<{ login?: string }> | undefined): string[] {
  return uniqueStrings(users?.map((user) => user.login) ?? []);
}

function uniqueNames(labels: Array<{ name?: string }> | undefined): string[] {
  return uniqueStrings(labels?.map((label) => label.name) ?? []);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}
