import { cleanupMountedNode, ensureMountedNode, ensureMountedSiblingNode } from "../../core/mount";
import type { AnchorCandidate, InjectionPageState } from "../../types";
import type { LarkRecordContext } from "./probe";
import type {
  LarkDomApplyRequest,
  LarkDomDraftRequest,
  LarkDraftApplyResult,
  LarkPageContext,
  LarkWorkflowDraft,
} from "../../../types/lark";
import type { LarkApplyAction, LarkDraftAction } from "../../../types/protocol";

const HEADER_MOUNT_ID = "lark-detail-action";
const PANEL_MOUNT_ID = "lark-detail-panel";

export type LarkRenderState =
  | "collapsed"
  | "draft-loading"
  | "draft-ready"
  | "submitting"
  | "success"
  | "error";

export type RenderLarkInjectionArgs = {
  pageState: InjectionPageState<LarkRecordContext>;
  context?: LarkRecordContext;
  anchor?: AnchorCandidate;
  deps?: LarkInjectionRendererDeps;
};

export type LarkInjectionRendererDeps = {
  pageContext?: LarkPageContext | null;
  getPageContext?: () => LarkPageContext | null;
  requestDraft?: (request: LarkDomDraftRequest) => Promise<LarkWorkflowDraft>;
  applyDraft?: (request: LarkDomApplyRequest) => Promise<LarkDraftApplyResult>;
};

export type LarkInjectionRenderer = {
  render(args: RenderLarkInjectionArgs): void;
  cleanup(): void;
};

type RuntimeErrorResponse = {
  error?: {
    errorCode?: string;
    errorMessage?: string;
  };
  payload?: unknown;
};

class LarkRuntimeRequestError extends Error {
  constructor(
    message: string,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = "LarkRuntimeRequestError";
    Object.setPrototypeOf(this, LarkRuntimeRequestError.prototype);
  }
}

function resolveTargetLabel(
  pageContext: LarkPageContext | null,
  draft: LarkWorkflowDraft | null,
): string | null {
  if (draft?.draftType === "b2" || pageContext?.pageType === "lark_a1") {
    return "Meegle Product Bug";
  }

  if (draft?.draftType === "b1" || pageContext?.pageType === "lark_a2") {
    return "Meegle User Story";
  }

  return null;
}

function formatPrimaryActionLabel(targetLabel: string | null): string {
  return targetLabel ? `创建 ${targetLabel}` : "发送到 Meegle";
}

function formatApplyActionLabel(targetLabel: string | null): string {
  return targetLabel ? `确认创建 ${targetLabel}` : "确认发送";
}

function formatDraftLoadingLabel(targetLabel: string | null): string {
  return targetLabel ? `正在准备 ${targetLabel} 草稿...` : "正在准备发送到 Meegle...";
}

function formatDraftReadyLabel(targetLabel: string | null, name: string): string {
  return targetLabel ? `准备创建 ${targetLabel}: ${name}` : `准备发送到 Meegle: ${name}`;
}

function formatSubmittingLabel(targetLabel: string | null): string {
  return targetLabel ? `正在创建 ${targetLabel}...` : "正在提交到 Meegle...";
}

function formatSuccessLabel(targetLabel: string | null): string {
  return targetLabel ? `已创建 ${targetLabel}` : "已发送到 Meegle";
}

function formatFailureLabel(targetLabel: string | null, hasDraft: boolean): string {
  if (targetLabel) {
    return hasDraft ? `创建 ${targetLabel} 失败，请重试提交` : `创建 ${targetLabel} 失败`;
  }

  return hasDraft ? "发送到 Meegle 失败，请重试提交" : "发送到 Meegle 失败";
}

function getChromeRuntime(): typeof chrome.runtime | null {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return null;
  }

  return globalThis.chrome.runtime;
}

async function sendRuntimeMessage<TPayload>(
  message: { action: string; payload: unknown },
): Promise<TPayload & RuntimeErrorResponse> {
  const runtime = getChromeRuntime();
  if (!runtime) {
    throw new Error("Chrome runtime is unavailable.");
  }

  return new Promise((resolve) => {
    runtime.sendMessage(message, (response) => {
      if (globalThis.chrome.runtime.lastError) {
        resolve({
          error: {
            errorCode: "BACKGROUND_ERROR",
            errorMessage: globalThis.chrome.runtime.lastError.message,
          },
        } as TPayload & RuntimeErrorResponse);
        return;
      }

      resolve((response ?? {}) as TPayload & RuntimeErrorResponse);
    });
  });
}

function buildSnapshot(context: LarkRecordContext) {
  return {
    title: context.title,
    fields: context.fields.map((field) => ({
      label: field.label,
      value: field.value,
    })),
  };
}

async function createDefaultDraft(request: LarkDomDraftRequest): Promise<LarkWorkflowDraft> {
  if (request.pageType === "unknown") {
    throw new Error("Unable to determine whether this record is A1 or A2.");
  }

  if (!request.recordId) {
    throw new Error("recordId is required to request a draft.");
  }

  if (!getChromeRuntime()) {
    throw new Error("Chrome runtime is unavailable.");
  }

  const action: LarkDraftAction =
    request.pageType === "lark_a2" ? "itdog.a2.create_b1_draft" : "itdog.a1.create_b2_draft";
  const response = await sendRuntimeMessage<{ payload?: LarkWorkflowDraft }>({
    action,
    payload: request,
  });

  if (response.payload) {
    return response.payload;
  }

  throw new LarkRuntimeRequestError(
    response.error?.errorMessage ?? "Draft request failed.",
    response.error?.errorCode,
  );
}

async function defaultApplyDraft(request: LarkDomApplyRequest): Promise<LarkDraftApplyResult> {
  if (request.pageType === "unknown") {
    throw new Error("Unable to determine whether this record is A1 or A2.");
  }

  if (!request.recordId) {
    throw new Error("recordId is required to apply a draft.");
  }

  if (!getChromeRuntime()) {
    throw new Error("Chrome runtime is unavailable.");
  }

  const action: LarkApplyAction =
    request.pageType === "lark_a2" ? "itdog.a2.apply_b1" : "itdog.a1.apply_b2";
  const response = await sendRuntimeMessage<{ payload?: LarkDraftApplyResult }>({
    action,
    payload: request,
  });

  if (response.payload) {
    return response.payload;
  }

  throw new LarkRuntimeRequestError(
    response.error?.errorMessage ?? "Apply request failed.",
    response.error?.errorCode,
  );
}

function resolvePanelErrorMessage(
  error: unknown,
  hasDraft: boolean,
  targetLabel: string | null,
): string {
  if (error instanceof LarkRuntimeRequestError) {
    if (error.errorCode === "MEEGLE_AUTH_REQUIRED") {
      return "Meegle 授权失效，请先在插件中重新授权后再试";
    }

    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return formatFailureLabel(targetLabel, hasDraft);
}

function createContextIdentity(context: LarkRecordContext, pageContext: LarkPageContext | null): string {
  const snapshotIdentity = {
    title: context.title,
    fields: context.fields.map((field) => ({
      label: field.label,
      value: field.value,
    })),
  };

  if (pageContext?.recordId) {
    return JSON.stringify({
      recordId: pageContext.recordId,
      snapshot: snapshotIdentity,
    });
  }

  return JSON.stringify(snapshotIdentity);
}

function readActiveContext(args: RenderLarkInjectionArgs): LarkRecordContext | null {
  if (args.pageState.kind === "detail-ready") {
    return args.pageState.context;
  }

  return args.context ?? null;
}

function readActiveAnchor(args: RenderLarkInjectionArgs): AnchorCandidate | null {
  if (args.pageState.kind === "detail-ready") {
    return args.pageState.anchor;
  }

  return args.anchor ?? null;
}

export function createLarkInjectionRenderer({
  pageContext = null,
  getPageContext,
  requestDraft = createDefaultDraft,
  applyDraft = defaultApplyDraft,
}: LarkInjectionRendererDeps = {}): LarkInjectionRenderer {
  let currentAnchor: Element | null = null;
  let buttonMount: HTMLElement | null = null;
  let panelMount: HTMLElement | null = null;
  let currentContextIdentity: string | null = null;
  let panelState: LarkRenderState = "collapsed";
  let draftPayload: LarkWorkflowDraft | null = null;
  let lastContext: LarkRecordContext | null = null;
  let lastErrorMessage: string | null = null;
  let nextRequestVersion = 0;
  let activeRequestVersion: number | null = null;

  function readPageContext(): LarkPageContext | null {
    return getPageContext?.() ?? pageContext;
  }

  function buildDraftRequest(context: LarkRecordContext): LarkDomDraftRequest {
    const nextPageContext = readPageContext();
    return {
      pageType: nextPageContext?.pageType ?? "unknown",
      url: nextPageContext?.url ?? "",
      baseId: nextPageContext?.baseId,
      tableId: nextPageContext?.tableId,
      recordId: nextPageContext?.recordId,
      operatorLarkId: nextPageContext?.operatorLarkId,
      snapshot: buildSnapshot(context),
    };
  }

  function buildApplyRequest(context: LarkRecordContext, draft: LarkWorkflowDraft): LarkDomApplyRequest {
    const nextPageContext = readPageContext();
    return {
      pageType: nextPageContext?.pageType ?? "unknown",
      url: nextPageContext?.url ?? "",
      baseId: nextPageContext?.baseId,
      tableId: nextPageContext?.tableId,
      recordId: nextPageContext?.recordId,
      operatorLarkId: nextPageContext?.operatorLarkId,
      masterUserId: nextPageContext?.masterUserId,
      snapshot: buildSnapshot(context),
      draft,
    };
  }

  function invalidatePendingRequest(): void {
    activeRequestVersion = null;
  }

  function cleanupCurrentMounts(): void {
    buttonMount?.remove();
    panelMount?.remove();

    buttonMount = null;
    panelMount = null;
    currentAnchor = null;
  }

  function setPanelState(nextState: LarkRenderState) {
    panelState = nextState;
    renderMountedUi();
  }

  function renderPanelContent(panel: HTMLElement): void {
    panel.textContent = "";

    const body = document.createElement("div");
    const targetLabel = resolveTargetLabel(readPageContext(), draftPayload);

    switch (panelState) {
      case "collapsed":
        body.textContent = "已折叠";
        panel.hidden = true;
        break;
      case "draft-loading":
        body.textContent = formatDraftLoadingLabel(targetLabel);
        panel.hidden = false;
        break;
      case "draft-ready":
        body.textContent = formatDraftReadyLabel(
          targetLabel,
          draftPayload?.name ?? lastContext?.title ?? "",
        );
        panel.hidden = false;
        break;
      case "submitting":
        body.textContent = formatSubmittingLabel(targetLabel);
        panel.hidden = false;
        break;
      case "success":
        body.textContent = formatSuccessLabel(targetLabel);
        panel.hidden = false;
        break;
      case "error":
        body.textContent = lastErrorMessage
          ?? formatFailureLabel(targetLabel, draftPayload !== null);
        panel.hidden = false;
        break;
    }

    if (panelState === "draft-ready" || (panelState === "error" && draftPayload !== null)) {
      const applyButton = document.createElement("button");
      applyButton.type = "button";
      applyButton.textContent = formatApplyActionLabel(targetLabel);
      applyButton.setAttribute("data-tenways-octo-trigger", "apply-to-meegle");
      applyButton.addEventListener("click", () => {
        const context = lastContext;
        const contextIdentity = currentContextIdentity;
        const currentDraft = draftPayload;
        if (context === null || currentDraft === null) {
          lastErrorMessage = formatFailureLabel(targetLabel, true);
          setPanelState("error");
          return;
        }

        const requestVersion = ++nextRequestVersion;
        activeRequestVersion = requestVersion;
        lastErrorMessage = null;
        setPanelState("submitting");
        void applyDraft(buildApplyRequest(context, currentDraft))
          .then(() => {
            if (
              activeRequestVersion !== requestVersion
              || currentContextIdentity !== contextIdentity
              || panelState !== "submitting"
            ) {
              return;
            }

            lastErrorMessage = null;
            setPanelState("success");
          })
          .catch((error) => {
            if (
              activeRequestVersion !== requestVersion
              || currentContextIdentity !== contextIdentity
              || panelState !== "submitting"
            ) {
              return;
            }

            lastErrorMessage = resolvePanelErrorMessage(error, true, targetLabel);
            setPanelState("error");
          });
      });
      panel.appendChild(applyButton);
    }
    panel.prepend(body);
  }

  function renderMountedUi(): void {
    if (currentAnchor === null || buttonMount === null || panelMount === null) {
      return;
    }

    buttonMount.textContent = "";
    const button = document.createElement("button");
    button.type = "button";
    const targetLabel = resolveTargetLabel(readPageContext(), draftPayload);
    button.textContent = formatPrimaryActionLabel(targetLabel);
    button.setAttribute("data-tenways-octo-trigger", "send-to-meegle");
    button.setAttribute("aria-expanded", panelState === "collapsed" ? "false" : "true");
    button.addEventListener("click", () => {
      if (panelState !== "collapsed") {
        invalidatePendingRequest();
        setPanelState("collapsed");
        return;
      }

      const context = lastContext;
      const contextIdentity = currentContextIdentity;
      if (context === null) {
        lastErrorMessage = formatFailureLabel(targetLabel, false);
        setPanelState("error");
        return;
      }

      const requestVersion = ++nextRequestVersion;
      activeRequestVersion = requestVersion;
      lastErrorMessage = null;
      setPanelState("draft-loading");
      const draftRequest = buildDraftRequest(context);
      void requestDraft(draftRequest)
        .then((draft) => {
          if (
            activeRequestVersion !== requestVersion
            || currentContextIdentity !== contextIdentity
            || panelState !== "draft-loading"
          ) {
            return;
          }

          draftPayload = draft;
          lastErrorMessage = null;
          setPanelState("draft-ready");
        })
        .catch((error) => {
          if (
            activeRequestVersion !== requestVersion
            || currentContextIdentity !== contextIdentity
            || panelState !== "draft-loading"
          ) {
            return;
          }

          draftPayload = null;
          lastErrorMessage = resolvePanelErrorMessage(error, false, targetLabel);
          setPanelState("error");
        });
    });
    buttonMount.appendChild(button);

    panelMount.setAttribute("data-tenways-octo-panel-state", panelState);
    renderPanelContent(panelMount);
  }

  function ensureMounts(anchor: Element): void {
    if (currentAnchor !== anchor) {
      cleanupCurrentMounts();
      currentAnchor = anchor;
      buttonMount = ensureMountedNode(HEADER_MOUNT_ID, anchor);
      panelMount = ensureMountedSiblingNode(PANEL_MOUNT_ID, anchor);
    } else if (buttonMount === null || panelMount === null) {
      buttonMount = ensureMountedNode(HEADER_MOUNT_ID, anchor);
      panelMount = ensureMountedSiblingNode(PANEL_MOUNT_ID, anchor);
    }
  }

  return {
    render(args) {
      if (args.pageState.kind !== "detail-ready") {
        invalidatePendingRequest();
        currentContextIdentity = null;
        panelState = "collapsed";
        draftPayload = null;
        lastErrorMessage = null;
        lastContext = null;
        cleanupCurrentMounts();
        return;
      }

      const context = readActiveContext(args);
      const anchor = readActiveAnchor(args);
      if (context === null || anchor === null) {
        return;
      }

      const nextContextIdentity = createContextIdentity(context, readPageContext());
      const hasViewChanged = currentAnchor !== anchor.element || currentContextIdentity !== nextContextIdentity;

      lastContext = context;
      if (hasViewChanged) {
        invalidatePendingRequest();
        currentContextIdentity = nextContextIdentity;
        panelState = "collapsed";
        draftPayload = null;
        lastErrorMessage = null;
      }

      ensureMounts(anchor.element);
      renderMountedUi();
    },
    cleanup() {
      invalidatePendingRequest();
      currentContextIdentity = null;
      panelState = "collapsed";
      draftPayload = null;
      lastErrorMessage = null;
      lastContext = null;
      cleanupCurrentMounts();
    },
  };
}

export function renderLarkInjection(args: RenderLarkInjectionArgs): void {
  createLarkInjectionRenderer(args.deps).render(args);
}
