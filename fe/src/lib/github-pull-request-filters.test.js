import assert from "node:assert/strict";
import test from "node:test";
import { countMyOpenGitHubPullRequests, matchesGitHubPullRequestQuickFilter } from "./github-pull-request-filters.js";

test("matches Open, Mine, My Open, and main-target GitHub PR quick filters", () => {
  const mineByReview = { state: "closed", authorLogin: "other", reviewers: ["@Octo"] };
  const mineByAuthor = { state: "open", authorLogin: "octo", reviewers: [] };
  const openForSomeoneElse = { state: "open", authorLogin: "other", reviewers: ["reviewer"] };
  const mergedToMain = { state: "merged", baseRef: "main" };
  const closedOnMain = { state: "closed", baseRef: "main" };
  const openOnMain = { state: "open", baseRef: "main" };
  const mergedToRelease = { state: "merged", baseRef: "release" };

  assert.equal(matchesGitHubPullRequestQuickFilter(mineByAuthor, "open", "octo"), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(mineByReview, "mine", "octo"), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(mineByAuthor, "mine", ""), false);
  assert.equal(matchesGitHubPullRequestQuickFilter(mineByAuthor, "my-open", "octo"), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(mineByReview, "my-open", "octo"), false);
  assert.equal(matchesGitHubPullRequestQuickFilter(openForSomeoneElse, "my-open", "octo"), false);
  assert.equal(matchesGitHubPullRequestQuickFilter(mergedToMain, "main", ""), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(closedOnMain, "main", ""), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(openOnMain, "main", ""), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(mergedToRelease, "main", ""), false);
  assert.equal(countMyOpenGitHubPullRequests([mineByReview, mineByAuthor, openForSomeoneElse], "octo"), 1);
});
