import type { PopupLogLevel } from "./types.js";

const POPUP_TOAST_ROOT_ID = "tenways-octo-popup-toast-root";

type PopupToastTone = Extract<PopupLogLevel, "success" | "error" | "warn" | "info">;

export function showPopupToast(
  text: string,
  tone: PopupToastTone = "info",
): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = ensurePopupToastRoot();
  const toast = document.createElement("div");
  toast.className = `popup-toast popup-toast--${tone}`;
  toast.textContent = text;
  root.append(toast);

  globalThis.setTimeout(() => {
    toast.classList.add("popup-toast--leaving");
    globalThis.setTimeout(() => {
      toast.remove();
      if (root.childElementCount === 0) {
        root.remove();
      }
    }, 180);
  }, 1800);
}

function ensurePopupToastRoot(): HTMLElement {
  const existing = document.getElementById(POPUP_TOAST_ROOT_ID);
  if (existing) {
    return existing;
  }

  const root = document.createElement("div");
  root.id = POPUP_TOAST_ROOT_ID;
  root.className = "popup-toast-root";

  const style = document.createElement("style");
  style.textContent = `
    .popup-toast-root {
      position: fixed;
      top: 14px;
      left: 14px;
      right: 14px;
      z-index: 2147483647;
      display: grid;
      gap: 8px;
      pointer-events: none;
    }
    .popup-toast {
      border-radius: 14px;
      padding: 10px 12px;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.45;
      box-shadow: 0 18px 38px rgb(15 23 42 / 18%);
      opacity: 1;
      transform: translateY(0);
      transition: opacity 180ms ease, transform 180ms ease;
    }
    .popup-toast--success { background: #15803d; }
    .popup-toast--error { background: #b91c1c; }
    .popup-toast--warn { background: #b45309; }
    .popup-toast--info { background: #1d4ed8; }
    .popup-toast--leaving {
      opacity: 0;
      transform: translateY(-6px);
    }
  `;
  root.append(style);
  document.body.append(root);
  return root;
}
