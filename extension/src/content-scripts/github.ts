import { fetchExtensionPageConfig, pageConfigHasActionPlacement } from "./shared/page-config";
import { injectSidebar } from "./shared/sidebar-injector";
import { installGitHubPrOdooDevopsBuildBadges } from "./github-pr-odoo-devops-build";
import type { GitHubPrOdooDevopsBuildResult } from "../types/protocol";

const GITHUB_PULL_REQUEST_PATH_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+(?:\/.*)?$/;
const GITHUB_ISSUE_PATH_PATTERN = /^\/[^/]+\/[^/]+\/issues\/\d+(?:\/.*)?$/;

export function isGitHubPullRequestPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "github.com"
      && GITHUB_PULL_REQUEST_PATH_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isGitHubIssuePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "github.com"
      && GITHUB_ISSUE_PATH_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isGitHubActionPage(url: string): boolean {
  return isGitHubPullRequestPage(url) || isGitHubIssuePage(url);
}

if (typeof window !== "undefined" && isGitHubActionPage(window.location.href)) {
  void (async () => {
    const pageConfig = await fetchExtensionPageConfig({
      url: window.location.href,
      fallbackPlatform: "github",
    });

    if (pageConfigHasActionPlacement(pageConfig, "sidebar")) {
      injectSidebar(
        {
          hostPageType: "github",
          hostUrl: window.location.href,
          hostOrigin: window.location.origin,
        },
        {
          showTrigger: pageConfig.sidebar.sidebarButtonEnabled,
          enableKeyboardShortcut: pageConfig.sidebar.keyboardShortcutEnabled,
        },
      );
    }

    if (pageConfig.matchedRuleId === "github.pr" && pageConfig.sidebar.injectPageElements) {
      installGitHubPrOdooDevopsBuildBadges({
        fetchBuild: async (context) => new Promise<GitHubPrOdooDevopsBuildResult["payload"]>((resolve) => {
          chrome.runtime.sendMessage({
            action: "octo.github-pr.odoo-devops-build.read",
            payload: context,
          }, (response) => {
            resolve(response?.action === "octo.github-pr.odoo-devops-build.read"
              ? response.payload
              : { status: "unavailable", errorCode: "GITHUB_PR_BUILD_UNAVAILABLE" });
          });
        }),
      });
    }
  })();
}
