import assert from "node:assert/strict";
import test from "node:test";
import { countMyOpenGitHubPullRequests, matchesGitHubPullRequestQuickFilter } from "./github-pull-request-filters.js";

test("matches Open, Mine, and My Open GitHub PR quick filters", () => {
  const mineByReview = { state: "closed", authorLogin: "other", reviewers: ["@Octo"] };
  const mineByAuthor = { state: "open", authorLogin: "octo", reviewers: [] };
  const openForSomeoneElse = { state: "open", authorLogin: "other", reviewers: ["reviewer"] };

  assert.equal(matchesGitHubPullRequestQuickFilter(mineByAuthor, "open", "octo"), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(mineByReview, "mine", "octo"), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(mineByAuthor, "mine", ""), false);
  assert.equal(matchesGitHubPullRequestQuickFilter(mineByAuthor, "my-open", "octo"), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(mineByReview, "my-open", "octo"), false);
  assert.equal(matchesGitHubPullRequestQuickFilter(openForSomeoneElse, "my-open", "octo"), false);
  assert.equal(countMyOpenGitHubPullRequests([mineByReview, mineByAuthor, openForSomeoneElse], "octo"), 1);
});
