// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  getOdooDevopsBadgeColor,
  parseGitHubPullRequestContext,
  renderGitHubPrOdooDevopsBuildBadges,
} from "./github-pr-odoo-devops-build.js";

describe("GitHub PR Odoo.sh build badges", () => {
  it("parses a pull request URL and rejects non-PR pages", () => {
    expect(parseGitHubPullRequestContext("https://github.com/TenwaysCom/Tenways/pull/1140/files"))
      .toEqual({ owner: "TenwaysCom", repo: "Tenways", pullNumber: 1140 });
    expect(parseGitHubPullRequestContext("https://github.com/TenwaysCom/Tenways/issues/1140")).toBeUndefined();
  });

  it("uses the requested failure, warning, and success colors", () => {
    expect(getOdooDevopsBadgeColor("failed")).toBe("#cf222e");
    expect(getOdooDevopsBadgeColor("warning")).toBe("#9a6700");
    expect(getOdooDevopsBadgeColor("success")).toBe("#1a7f37");
    expect(getOdooDevopsBadgeColor("no_build")).toBe("#8c959f");
  });

  it("inserts badges beside the header state and above the merge control once", () => {
    document.body.innerHTML = `
      <div data-component="PageHeader.Description"><span data-component="StateLabel">Open</span></div>
      <div class="js-merge-pr"><button data-merge-button="true">Merge pull request</button></div>
    `;
    const data = {
      environment: "eu" as const,
      headRef: "feature/m-1140",
      build: { branch: "feature/m-1140", status: "done", result: "success" },
    };

    expect(renderGitHubPrOdooDevopsBuildBadges(document, data)).toBe(true);
    expect(document.querySelector("[data-octo-github-pr-build-badge='header']")?.previousElementSibling?.getAttribute("data-component"))
      .toBe("StateLabel");
    expect(document.querySelector("[data-octo-github-pr-build-badge='merge']")?.nextElementSibling?.className)
      .toBe("js-merge-pr");
    const headerLink = document.querySelector<HTMLElement>("[data-octo-github-pr-build-badge='header']")?.shadowRoot?.querySelector("a");
    expect(headerLink).toMatchObject({
      href: "https://www.odoo.sh/project/tenways/builds/",
      target: "_blank",
      rel: "noopener noreferrer",
    });
    expect(renderGitHubPrOdooDevopsBuildBadges(document, data)).toBe(false);
  });

  it("uses the GitHub merge container when the button is not rendered yet", () => {
    document.body.innerHTML = `<div id="partial-pull-merging"></div>`;
    const data = {
      environment: "eu" as const,
      headRef: "feature/m-1140",
      build: { branch: "feature/m-1140", status: "done", result: "success" },
    };

    expect(renderGitHubPrOdooDevopsBuildBadges(document, data)).toBe(true);
    expect(document.querySelector("[data-octo-github-pr-build-badge='merge']")?.nextElementSibling?.id)
      .toBe("partial-pull-merging");
  });

  it("finds the plain Merge pull request button used by GitHub's current merge card", () => {
    document.body.innerHTML = `
      <section id="merge-card">
        <strong>No conflicts with base branch</strong>
        <p>Merging can be performed automatically.</p>
        <div><button type="button">Merge pull request</button><button type="button">▼</button></div>
      </section>
    `;
    const data = {
      environment: "eu" as const,
      headRef: "feature/m-1140",
      build: { branch: "feature/m-1140", status: "done", result: "success" },
    };

    expect(renderGitHubPrOdooDevopsBuildBadges(document, data)).toBe(true);
    expect(document.querySelector("[data-octo-github-pr-build-badge='merge']")?.nextElementSibling?.id).toBe("merge-card");
  });
});
