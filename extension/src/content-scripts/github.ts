import { injectSidebar } from "./shared/sidebar-injector";

const GITHUB_PULL_REQUEST_PATH_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+(?:\/.*)?$/;

export function isGitHubPullRequestPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "github.com"
      && GITHUB_PULL_REQUEST_PATH_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

if (typeof window !== "undefined" && isGitHubPullRequestPage(window.location.href)) {
  injectSidebar({
    hostPageType: "github",
    hostUrl: window.location.href,
    hostOrigin: window.location.origin,
  });
}
