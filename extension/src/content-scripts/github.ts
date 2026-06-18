import { fetchExtensionPageConfig } from "./shared/page-config";
import { injectSidebar } from "./shared/sidebar-injector";

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

    if (!pageConfig.sidebar.injectPageElements) {
      return;
    }

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
  })();
}
