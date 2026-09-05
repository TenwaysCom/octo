import type { GitHubPrOdooDevopsBuildResult } from "../types/protocol.js";

export interface GitHubPullRequestContext {
  owner: string;
  repo: string;
  pullNumber: number;
}

type BuildData = NonNullable<GitHubPrOdooDevopsBuildResult["payload"]["data"]>;
type BadgeLocation = "header" | "merge";

const HOST_ATTRIBUTE = "data-octo-github-pr-build-badge";
const ODOO_SH_BUILDS_URL = "https://www.odoo.sh/project/tenways/builds/";
const STATUS_COLORS: Record<string, string> = {
  failed: "#cf222e",
  failure: "#cf222e",
  warning: "#9a6700",
  success: "#1a7f37",
  no_build: "#8c959f",
};

export function parseGitHubPullRequestContext(url: string): GitHubPullRequestContext | undefined {
  try {
    const parsed = new URL(url);
    const match = parsed.hostname === "github.com"
      ? parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/)
      : undefined;
    if (!match) {
      return undefined;
    }
    return { owner: match[1], repo: match[2], pullNumber: Number(match[3]) };
  } catch {
    return undefined;
  }
}

export function getOdooDevopsBadgeColor(result: string): string {
  return STATUS_COLORS[result.trim().toLocaleLowerCase()] ?? "#57606a";
}

function badgeId(location: BadgeLocation): string {
  return `octo-github-pr-build-${location}`;
}

function createBadge(documentRef: Document, data: BuildData, location: BadgeLocation): HTMLElement {
  const host = documentRef.createElement("span");
  host.id = badgeId(location);
  host.setAttribute(HOST_ATTRIBUTE, location);
  host.style.display = location === "header" ? "inline-flex" : "flex";
  host.style.margin = location === "header" ? "0 0 0 8px" : "0 0 8px";
  const shadow = host.attachShadow({ mode: "open" });
  const link = documentRef.createElement("a");
  link.href = ODOO_SH_BUILDS_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.style.cssText = "color:inherit;text-decoration:none;cursor:pointer;";
  const chip = documentRef.createElement("span");
  const result = data.build?.result ?? "no_build";
  chip.textContent = data.build
    ? `Odoo.sh ${data.environment.toUpperCase()} · ${result}`
    : `Odoo.sh ${data.environment.toUpperCase()} · no build`;
  chip.title = data.build
    ? `${data.headRef}: ${data.build.status} / ${data.build.result}`
    : `${data.headRef}: no Odoo.sh build found`;
  chip.style.cssText = [
    "display:inline-flex", "align-items:center", "gap:5px", "border-radius:999px",
    "padding:2px 8px", "font:600 12px/18px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    "white-space:nowrap", `color:${getOdooDevopsBadgeColor(result)}`,
    `background:${data.build ? `${getOdooDevopsBadgeColor(result)}1a` : "#afb8c133"}`,
  ].join(";");
  const dot = documentRef.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${getOdooDevopsBadgeColor(result)};`;
  chip.prepend(dot);
  link.append(chip);
  shadow.append(link);
  return host;
}

function findHeaderAnchor(documentRef: Document): Element | undefined {
  return documentRef.querySelector("[data-component='PageHeader.Description'] [data-component='StateLabel']")
    ?? documentRef.querySelector(".gh-header-meta .State")
    ?? undefined;
}

function findMergePanel(documentRef: Document): Element | undefined {
  const mergeButton = documentRef.querySelector("[data-testid='merge-button']")
    ?? documentRef.querySelector("button[data-merge-button]")
    ?? documentRef.querySelector("form.js-merge-pull-request button[type='submit']")
    ?? documentRef.querySelector(".js-merge-pr button[type='submit']")
    ?? Array.from(documentRef.querySelectorAll("button, [role='button']")).find((element) =>
      /^merge pull request\b/i.test(element.textContent?.trim() ?? ""),
    );
  if (mergeButton) {
    const namedPanel = mergeButton.closest(".js-merge-pr, .merge-message, form, [data-testid*='merge' i], [id*='merge' i], [class*='merge' i]");
    if (namedPanel) {
      return namedPanel;
    }

    let ancestor = mergeButton.parentElement;
    for (let depth = 0; ancestor && depth < 6; depth += 1, ancestor = ancestor.parentElement) {
      const panelText = ancestor.textContent ?? "";
      if (/no conflicts with base branch|merging can be performed automatically/i.test(panelText)) {
        return ancestor;
      }
    }
    return mergeButton.parentElement ?? mergeButton;
  }

  return documentRef.querySelector("#partial-pull-merging")
    ?? documentRef.querySelector(".js-merge-pr")
    ?? documentRef.querySelector("[data-testid='pull-request-merge-container']")
    ?? undefined;
}

export function renderGitHubPrOdooDevopsBuildBadges(documentRef: Document, data: BuildData): boolean {
  let rendered = false;
  if (!documentRef.getElementById(badgeId("header"))) {
    const headerAnchor = findHeaderAnchor(documentRef);
    if (headerAnchor) {
      headerAnchor.insertAdjacentElement("afterend", createBadge(documentRef, data, "header"));
      rendered = true;
    }
  }
  if (!documentRef.getElementById(badgeId("merge"))) {
    const mergePanel = findMergePanel(documentRef);
    if (mergePanel) {
      mergePanel.insertAdjacentElement("beforebegin", createBadge(documentRef, data, "merge"));
      rendered = true;
    }
  }
  return rendered;
}

export function installGitHubPrOdooDevopsBuildBadges(input: {
  windowRef?: Window;
  documentRef?: Document;
  fetchBuild: (context: GitHubPullRequestContext) => Promise<GitHubPrOdooDevopsBuildResult["payload"]>;
}): () => void {
  const windowRef = input.windowRef ?? window;
  const documentRef = input.documentRef ?? document;
  let activeUrl = "";
  let data: BuildData | undefined;

  const render = () => {
    if (data) {
      renderGitHubPrOdooDevopsBuildBadges(documentRef, data);
    }
  };
  const refresh = async () => {
    const url = windowRef.location.href;
    const context = parseGitHubPullRequestContext(url);
    if (!context || url === activeUrl) {
      render();
      return;
    }
    activeUrl = url;
    data = undefined;
    documentRef.querySelectorAll(`[${HOST_ATTRIBUTE}]`).forEach((element) => element.remove());
    const result = await input.fetchBuild(context);
    if (result.status === "ready" && result.data) {
      data = result.data;
      render();
    }
  };
  const observer = new MutationObserver(render);
  observer.observe(documentRef.documentElement, { childList: true, subtree: true });
  documentRef.addEventListener("turbo:render", refresh);
  documentRef.addEventListener("pjax:end", refresh);
  void refresh();
  return () => {
    observer.disconnect();
    documentRef.removeEventListener("turbo:render", refresh);
    documentRef.removeEventListener("pjax:end", refresh);
  };
}
