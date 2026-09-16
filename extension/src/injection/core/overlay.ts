import { MOUNT_ATTR } from "./mount";

export type ProbeDebugInfo = {
  isDetailOpen: boolean;
  hasDetailRoot: boolean;
  parsedFieldCount: number;
  parsedFields: Array<{ label: string; value: string }>;
  domScanResults: Array<{ selector: string; label: string | null; value: string | null }>;
  urlRecordId: string | null;
  fieldExtractRecordId: string | null;
  domExtractRecordId: string | null;
};

export type ProbeOverlayState = {
  detailState: "closed" | "detail-loading" | "detail-ready";
  detailTitle: string | null;
  anchorLabel: string | null;
  recordId: string | null;
  debug?: ProbeDebugInfo;
};

export type ProbeOverlayHandle = {
  render(state: ProbeOverlayState): void;
  destroy(): void;
};

const PROBE_OVERLAY_ATTR = "data-tenways-lark-probe-overlay";
const PROBE_OVERLAY_ID = "tenways-lark-probe-overlay";

function getMountTarget(): HTMLElement {
  return document.body ?? document.documentElement;
}

function ensureOverlayRoot(existingRoot: HTMLDivElement | null): HTMLDivElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  if (existingRoot?.isConnected) {
    return existingRoot;
  }

  const foundRoot = document.querySelector(
    `[${PROBE_OVERLAY_ATTR}]`,
  ) as HTMLDivElement | null;
  if (foundRoot) {
    return foundRoot;
  }

  const overlay = document.createElement("div");
  overlay.id = PROBE_OVERLAY_ID;
  overlay.setAttribute(PROBE_OVERLAY_ATTR, "true");
  overlay.setAttribute(MOUNT_ATTR, "probe-overlay");
  overlay.style.position = "fixed";
  overlay.style.right = "16px";
  overlay.style.bottom = "16px";
  overlay.style.zIndex = "2147483647";
  overlay.style.width = "280px";
  overlay.style.padding = "10px 12px";
  overlay.style.borderRadius = "12px";
  overlay.style.background = "rgba(15, 23, 42, 0.92)";
  overlay.style.color = "#e2e8f0";
  overlay.style.font = "12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  overlay.style.boxShadow = "0 10px 30px rgba(15, 23, 42, 0.35)";
  overlay.style.whiteSpace = "pre-wrap";
  overlay.style.pointerEvents = "auto";

  const textNode = document.createElement("div");
  overlay.appendChild(textNode);

  return overlay;
}

function renderOverlayText(root: HTMLDivElement, state: ProbeOverlayState): void {
  const textNode = root.firstElementChild as HTMLDivElement | null;
  if (!textNode) {
    return;
  }

  const lines = [
    "[Tenways Octo probe]",
    `detail: ${state.detailState}`,
    `title: ${state.detailTitle ?? "-"}`,
    `anchor: ${state.anchorLabel ?? "-"}`,
    `recordId: ${state.recordId ?? "-"}`,
  ];

  if (state.debug) {
    lines.push("", "[Debug Info]");
    lines.push(`detailOpen: ${state.debug.isDetailOpen}`);
    lines.push(`hasRoot: ${state.debug.hasDetailRoot}`);
    lines.push(`parsedFields: ${state.debug.parsedFieldCount}`);
    lines.push(`urlRecordId: ${state.debug.urlRecordId ?? "-"}`);
    lines.push(`fieldExtract: ${state.debug.fieldExtractRecordId ?? "-"}`);
    lines.push(`domExtract: ${state.debug.domExtractRecordId ?? "-"}`);

    if (state.debug.parsedFields.length > 0) {
      lines.push("", "[Parsed Fields]");
      state.debug.parsedFields.slice(0, 5).forEach((f) => {
        lines.push(`  ${f.label}: ${f.value.substring(0, 30)}${f.value.length > 30 ? "..." : ""}`);
      });
    }

    if (state.debug.domScanResults.length > 0) {
      lines.push("", "[DOM Scan]");
      state.debug.domScanResults.slice(0, 5).forEach((r) => {
        const label = r.label ?? "?";
        const value = r.value?.substring(0, 20) ?? "-";
        lines.push(`  ${label}: ${value}`);
      });
    }
  }

  textNode.textContent = lines.join("\n");
}

export function createProbeOverlay(onRefresh: () => void): ProbeOverlayHandle {
  let root: HTMLDivElement | null = null;

  function ensureRoot(): HTMLDivElement | null {
    root = ensureOverlayRoot(root);
    if (!root) {
      return null;
    }

    if (!root.isConnected) {
      const mountTarget = getMountTarget();
      mountTarget.appendChild(root);
    }

    if (!root.querySelector("button")) {
      const refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.textContent = "Refresh probe";
      refreshButton.style.marginTop = "8px";
      refreshButton.style.padding = "4px 8px";
      refreshButton.style.border = "0";
      refreshButton.style.borderRadius = "999px";
      refreshButton.style.background = "#2563eb";
      refreshButton.style.color = "#fff";
      refreshButton.style.cursor = "pointer";
      refreshButton.addEventListener("click", onRefresh);
      root.appendChild(refreshButton);
    }

    return root;
  }

  return {
    render(state: ProbeOverlayState) {
      const overlay = ensureRoot();
      if (!overlay) {
        return;
      }
      renderOverlayText(overlay, state);
    },
    destroy() {
      root?.remove();
      root = null;
    },
  };
}
