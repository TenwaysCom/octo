export type PopupPageType = "meegle" | "lark" | "unsupported";

export interface PopupIdentityState {
  larkId?: string | null;
  meegleUserKey?: string | null;
}

export interface PopupAuthState {
  lark: boolean;
  meegle: boolean;
}

export interface CreatePopupViewModelInput {
  pageType: PopupPageType;
  identity: PopupIdentityState;
  isAuthed: PopupAuthState;
}

export interface PopupViewModel {
  subtitle: string;
  showUnsupported: boolean;
  showAuthBlockTop: boolean;
  showAuthBlockBottom: boolean;
  showLarkFeatureBlock: boolean;
  showMeegleFeatureBlock: boolean;
  canAnalyze: boolean;
  canDraft: boolean;
  canApply: boolean;
}

export interface PopupHeaderContextInput {
  platform?: string | null;
  module?: string | null;
  task?: string | null;
  status?: string | null;
}

export function detectPopupPageType(url: string): PopupPageType {
  if (url.includes("project.larksuite.com") || url.includes("meegle.com")) {
    return "meegle";
  }

  if (url.includes("feishu.cn") || url.includes("larksuite.com")) {
    return "lark";
  }

  return "unsupported";
}

export function createPopupViewModel(
  input: CreatePopupViewModelInput,
): PopupViewModel {
  const showUnsupported = input.pageType === "unsupported";
  const showAuthBlockTop = !showUnsupported;
  const isFullyAuthorized = input.isAuthed.lark && input.isAuthed.meegle;
  const showAuthBlockBottom = showAuthBlockTop && isFullyAuthorized;
  const showLarkFeatureBlock = input.pageType === "lark" && isFullyAuthorized;
  const showMeegleFeatureBlock = input.pageType === "meegle" && isFullyAuthorized;

  return {
    subtitle: resolveSubtitle(input.pageType),
    showUnsupported,
    showAuthBlockTop,
    showAuthBlockBottom,
    showLarkFeatureBlock,
    showMeegleFeatureBlock,
    canAnalyze: showLarkFeatureBlock,
    canDraft: showLarkFeatureBlock,
    canApply: showLarkFeatureBlock,
  };
}

export function buildPopupHeaderContext(
  input: PopupHeaderContextInput,
): string | null {
  const segments = [input.platform, input.module, input.task, input.status]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return segments.length > 0 ? segments.join(" · ") : null;
}

function resolveSubtitle(pageType: PopupPageType): string {
  if (pageType === "meegle") {
    return "Meegle";
  }

  if (pageType === "lark") {
    return "Lark";
  }

  return "不支持";
}
