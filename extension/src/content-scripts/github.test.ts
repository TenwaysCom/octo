import { describe, expect, it } from "vitest";
import { isGitHubPullRequestPage } from "./github.js";

describe("github content script", () => {
  it("recognizes GitHub pull request pages", () => {
    expect(isGitHubPullRequestPage("https://github.com/tenways/tw-itdog/pull/123")).toBe(
      true,
    );
  });

  it("ignores non-pull-request GitHub pages", () => {
    expect(isGitHubPullRequestPage("https://github.com/tenways/tw-itdog")).toBe(false);
    expect(isGitHubPullRequestPage("https://github.com/tenways/tw-itdog/issues/12")).toBe(
      false,
    );
  });
});
