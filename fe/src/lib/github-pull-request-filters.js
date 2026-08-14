export function matchesGitHubPullRequestQuickFilter(item, filter, githubId) {
  if (filter === "open") {
    return item.state === "open";
  }
  if (filter === "mine") {
    return isMyGitHubPullRequest(item, githubId);
  }
  if (filter === "my-open") {
    return item.state === "open" && isMyGitHubPullRequest(item, githubId);
  }
  return true;
}

export function countMyOpenGitHubPullRequests(items, githubId) {
  return items.filter((item) => matchesGitHubPullRequestQuickFilter(item, "my-open", githubId)).length;
}

function isMyGitHubPullRequest(item, githubId) {
  const normalizedGitHubId = normalizeGitHubId(githubId);
  if (!normalizedGitHubId) {
    return false;
  }
  return [item.authorLogin, ...(item.reviewers || [])]
    .some((login) => normalizeGitHubId(login) === normalizedGitHubId);
}

function normalizeGitHubId(value) {
  return String(value || "").trim().replace(/^@/, "").toLocaleLowerCase();
}
