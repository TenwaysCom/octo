import { extractLarkBaseContextFromUrl, type LarkBaseUrlContext } from "../lark-base-url.js";
import type { PopupPageType } from "../popup/view-model.js";

export type ActionPageType = PopupPageType | "github_pr" | "github_issue" | "unsupported";

export interface ActionRuntimeCurrentTab {
  id: number | null;
  url: string | null;
  origin: string | null;
  pageType: ActionPageType;
}

export interface ActionRuntimeIdentity {
  masterUserId: string | null;
}

export interface ActionRuntimeMeegleContext {
  projectKey: string;
  workItemTypeKey: string;
  workItemId: string;
  baseUrl: string;
}

export interface ActionRuntimeGitHubContext {
  owner: string;
  repo: string;
  kind: "pr" | "issue";
  number: number;
  url: string;
}

export interface ActionRuntimePageContext {
  lark?: LarkBaseUrlContext;
  meegle?: ActionRuntimeMeegleContext;
  github?: ActionRuntimeGitHubContext;
}

export interface ActionRuntimeContext {
  actionRunId: string;
  currentTab: ActionRuntimeCurrentTab;
  identity: ActionRuntimeIdentity;
  pageContext: ActionRuntimePageContext;
  previewState: Record<string, unknown>;
  formValues: Record<string, unknown>;
  clientContext: Record<string, unknown>;
}

export interface CollectActionRuntimeContextInput {
  actionRunId: string;
  currentTab: ActionRuntimeCurrentTab;
  identity: ActionRuntimeIdentity;
  previewState?: Record<string, unknown>;
  formValues?: Record<string, unknown>;
  clientContext?: Record<string, unknown>;
}

export function parseMeegleWorkitemContext(
  rawUrl: string | null | undefined,
  fallbackOrigin = "https://project.larksuite.com",
): ActionRuntimeMeegleContext | undefined {
  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length < 4 || pathParts[2] !== "detail") {
      return undefined;
    }

    return {
      projectKey: pathParts[0],
      workItemTypeKey: pathParts[1],
      workItemId: pathParts[3],
      baseUrl: url.origin || fallbackOrigin,
    };
  } catch {
    return undefined;
  }
}

export function parseGitHubWorkitemContext(
  rawUrl: string | null | undefined,
): ActionRuntimeGitHubContext | undefined {
  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "github.com") {
      return undefined;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length < 4) {
      return undefined;
    }

    const [owner, repo, kindSegment, numberSegment] = pathParts;
    const number = Number.parseInt(numberSegment, 10);
    if (!owner || !repo || !Number.isInteger(number) || number <= 0) {
      return undefined;
    }

    if (kindSegment === "pull") {
      return {
        owner,
        repo,
        kind: "pr",
        number,
        url: rawUrl,
      };
    }

    if (kindSegment === "issues") {
      return {
        owner,
        repo,
        kind: "issue",
        number,
        url: rawUrl,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function collectActionRuntimeContext(
  input: CollectActionRuntimeContextInput,
): ActionRuntimeContext {
  const url = input.currentTab.url;
  const origin = input.currentTab.origin;
  return {
    actionRunId: input.actionRunId,
    currentTab: input.currentTab,
    identity: input.identity,
    pageContext: {
      lark: extractLarkBaseContextFromUrl(url ?? undefined),
      meegle: parseMeegleWorkitemContext(url, origin ?? undefined),
      github: parseGitHubWorkitemContext(url),
    },
    previewState: input.previewState ?? {},
    formValues: input.formValues ?? {},
    clientContext: input.clientContext ?? {},
  };
}
