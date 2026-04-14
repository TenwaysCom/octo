import { cleanupMountedNode, ensureMountedNode, ensureMountedSiblingNode } from "../../core/mount";
import type { AnchorCandidate, InjectionPageState } from "../../types";
import type { LarkRecordContext } from "./probe";
import type {
  LarkPageContext,
  LarkBaseCreateWorkitemRequest,
  LarkBaseCreateWorkitemResultPayload,
  LarkRecordSnapshot,
} from "../../../types/lark";
import type { ProtocolAction } from "../../../types/protocol";

const HEADER_MOUNT_ID = "lark-detail-action";
const PANEL_MOUNT_ID = "lark-detail-panel";

export type LarkRenderState = "collapsed" | "submitting" | "success" | "error";

export type RenderLarkInjectionArgs = {
  pageState: InjectionPageState<LarkRecordContext>;
  context?: LarkRecordContext;
  anchor?: AnchorCandidate;
  deps?: LarkInjectionRendererDeps;
};

export type LarkCreateWorkitemRequest = {
  pageType: "lark_base";
  url: string;
  baseId?: string;
  tableId?: string;
  recordId?: string;
  operatorLarkId?: string;
  masterUserId?: string;
  snapshot: LarkRecordSnapshot;
};

export type LarkCreateWorkitemResult = {
  status: "created";
  workitemId: string;
  workitems?: Array<{ workitemId: string; meegleLink: string }>;
};

export type LarkInjectionRendererDeps = {
  pageContext?: LarkPageContext | null;
  getPageContext?: () => LarkPageContext | null;
  createWorkitem?: (request: LarkCreateWorkitemRequest) => Promise<LarkCreateWorkitemResult>;
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

function resolveIssueTypeLabel(recordContext: LarkRecordContext | null | undefined): string | null {
  const issueTypeField = recordContext?.fields.find((field) => {
    const label = field.label.trim().toLowerCase();
    return label === "issue 类型" || label === "issue type";
  });
  const issueType = issueTypeField?.value.trim() ?? "";
  if (issueType.includes("User Story")) {
    return "Meegle User Story";
  }
  if (issueType.includes("Tech Task")) {
    return "Meegle Tech Task";
  }
  if (issueType.includes("Production Bug")) {
    return "Meegle Production Bug";
  }
  return null;
}

function resolveTargetLabel(recordContext?: LarkRecordContext | null): string | null {
  return resolveIssueTypeLabel(recordContext) ?? "Meegle Work Item";
}

function formatPrimaryActionLabel(targetLabel: string | null): string {
  return targetLabel ? `创建 ${targetLabel}` : "发送到 Meegle";
}

function formatSubmittingLabel(targetLabel: string | null): string {
  return targetLabel ? `正在创建 ${targetLabel}...` : "正在提交到 Meegle...";
}

function formatSuccessLabel(targetLabel: string | null): string {
  return targetLabel ? `已创建 ${targetLabel}` : "已发送到 Meegle";
}

function formatFailureLabel(targetLabel: string | null): string {
  return targetLabel ? `创建 ${targetLabel} 失败` : "发送到 Meegle 失败";
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

function buildSnapshot(context: LarkRecordContext, pageContext: LarkPageContext | null): LarkRecordSnapshot {
  const larkUrl = pageContext?.url ?? (typeof window !== "undefined" ? window.location.href : "");
  return {
    title: context.title,
    fields: context.fields.map((field) => ({
      label: field.label,
      value: field.value,
    })),
    larkUrl,
  };
}

async function defaultCreateWorkitem(request: LarkCreateWorkitemRequest): Promise<LarkCreateWorkitemResult> {
  if (!request.recordId) {
    throw new Error("recordId is required to create a workitem.");
  }

  if (!getChromeRuntime()) {
    throw new Error("Chrome runtime is unavailable.");
  }

  const payload: LarkBaseCreateWorkitemRequest = {
    pageType: "lark_base",
    url: request.url,
    baseId: request.baseId,
    tableId: request.tableId,
    recordId: request.recordId,
    operatorLarkId: request.operatorLarkId,
    masterUserId: request.masterUserId,
    snapshot: request.snapshot,
  };
  const action: ProtocolAction = "itdog.lark_base.create_workitem";
  const response = await sendRuntimeMessage<{ payload?: LarkBaseCreateWorkitemResultPayload }>({
    action,
    payload,
  });

  if (response.payload) {
    return {
      status: "created",
      workitemId: response.payload.workitemId,
      workitems: response.payload.workitems,
    };
  }

  throw new LarkRuntimeRequestError(
    response.error?.errorMessage ?? "Create workitem request failed.",
    response.error?.errorCode,
  );
}

function resolvePanelErrorMessage(error: unknown, targetLabel: string | null): string {
  if (error instanceof LarkRuntimeRequestError) {
    if (error.errorCode === "MEEGLE_AUTH_REQUIRED") {
      return "Meegle 授权失效，请先在插件中重新授权后再试";
    }

    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return formatFailureLabel(targetLabel);
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
  createWorkitem = defaultCreateWorkitem,
}: LarkInjectionRendererDeps = {}): LarkInjectionRenderer {
  let currentAnchor: Element | null = null;
  let buttonMount: HTMLElement | null = null;
  let panelMount: HTMLElement | null = null;
  let currentContextIdentity: string | null = null;
  let panelState: LarkRenderState = "collapsed";
  let lastContext: LarkRecordContext | null = null;
  let lastErrorMessage: string | null = null;
  let nextRequestVersion = 0;
  let activeRequestVersion: number | null = null;

  function readPageContext(): LarkPageContext | null {
    return getPageContext?.() ?? pageContext;
  }

  function buildCreateRequest(context: LarkRecordContext): LarkCreateWorkitemRequest {
    const nextPageContext = readPageContext();
    return {
      pageType: "lark_base",
      url: nextPageContext?.url ?? "",
      baseId: nextPageContext?.baseId,
      tableId: nextPageContext?.tableId,
      recordId: nextPageContext?.recordId,
      operatorLarkId: nextPageContext?.operatorLarkId,
      masterUserId: nextPageContext?.masterUserId,
      snapshot: buildSnapshot(context, nextPageContext),
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
    const targetLabel = resolveTargetLabel(lastContext);

    switch (panelState) {
      case "collapsed":
        body.textContent = "已折叠";
        panel.hidden = true;
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
        body.textContent = lastErrorMessage ?? formatFailureLabel(targetLabel);
        panel.hidden = false;
        break;
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
    const targetLabel = resolveTargetLabel(lastContext);
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
        lastErrorMessage = formatFailureLabel(targetLabel);
        setPanelState("error");
        return;
      }

      const requestVersion = ++nextRequestVersion;
      activeRequestVersion = requestVersion;
      lastErrorMessage = null;
      setPanelState("submitting");
      void createWorkitem(buildCreateRequest(context))
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

          lastErrorMessage = resolvePanelErrorMessage(error, targetLabel);
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
        lastErrorMessage = null;
      }

      ensureMounts(anchor.element);
      renderMountedUi();
    },
    cleanup() {
      invalidatePendingRequest();
      currentContextIdentity = null;
      panelState = "collapsed";
      lastErrorMessage = null;
      lastContext = null;
      cleanupCurrentMounts();
    },
  };
}

export function renderLarkInjection(args: RenderLarkInjectionArgs): void {
  createLarkInjectionRenderer(args.deps).render(args);
}
