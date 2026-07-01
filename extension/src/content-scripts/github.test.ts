import { describe, expect, it } from "vitest";
import {
  isGitHubActionPage,
  isGitHubIssuePage,
  isGitHubPullRequestPage,
} from "./github.js";

describe("github content script", () => {
  it("recognizes GitHub pull request pages", () => {
    expect(isGitHubPullRequestPage("https://github.com/TenwaysCom/octo/pull/123")).toBe(
      true,
    );
  });

  it("ignores non-pull-request GitHub pages", () => {
    expect(isGitHubPullRequestPage("https://github.com/TenwaysCom/octo")).toBe(false);
    expect(isGitHubPullRequestPage("https://github.com/TenwaysCom/octo/issues/12")).toBe(
      false,
    );
  });

  it("recognizes GitHub issue pages as action pages", () => {
    const url = "https://github.com/TenwaysCom/octo/issues/35";

    expect(isGitHubIssuePage(url)).toBe(true);
    expect(isGitHubActionPage(url)).toBe(true);
  });
});
