import assert from "node:assert/strict";
import test from "node:test";
import { matchesGitHubPullRequestQuickFilter } from "./github-pull-request-filters.js";

test("matches Open and Mine GitHub PR quick filters", () => {
  const mineByReview = { state: "closed", authorLogin: "other", reviewers: ["@Octo"] };
  const mineByAuthor = { state: "open", authorLogin: "octo", reviewers: [] };

  assert.equal(matchesGitHubPullRequestQuickFilter(mineByAuthor, "open", "octo"), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(mineByReview, "mine", "octo"), true);
  assert.equal(matchesGitHubPullRequestQuickFilter(mineByAuthor, "mine", ""), false);
});
