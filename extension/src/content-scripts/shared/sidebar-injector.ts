const SIDEBAR_HOST_ID = "tenways-octo-sidebar-host";
const SIDEBAR_Z_INDEX = "2147483646";

export interface SidebarHostContext {
  hostPageType?: "lark" | "meegle" | "github";
  hostUrl?: string;
  hostOrigin?: string;
  larkUserId?: string;
  meegleUserKey?: string;
}

export type SidebarInjectorHandle = {
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
};

function ensureShadowHost(): HTMLElement {
  const existing = document.getElementById(SIDEBAR_HOST_ID);
  if (existing) {
    return existing;
  }

  const host = document.createElement("div");
  host.id = SIDEBAR_HOST_ID;
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "0";
  host.style.height = "0";
  host.style.zIndex = SIDEBAR_Z_INDEX;
  host.style.pointerEvents = "none";
  document.body.appendChild(host);
  return host;
}

function getIconUrl(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL("icons/icon-48.png");
  }
  return "";
}

function getPopupUrl(context?: SidebarHostContext): string {
  const target = "sidebar-popup.html";
  const params = new URLSearchParams();

  if (context?.hostPageType) {
    params.set("hostPageType", context.hostPageType);
  }

  if (context?.hostUrl) {
    params.set("hostUrl", context.hostUrl);
  }

  if (context?.hostOrigin) {
    params.set("hostOrigin", context.hostOrigin);
  }

  if (context?.larkUserId) {
    params.set("larkUserId", context.larkUserId);
  }

  if (context?.meegleUserKey) {
    params.set("meegleUserKey", context.meegleUserKey);
  }

  const search = params.toString();
  const resolvedTarget = search ? `${target}?${search}` : target;

  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(resolvedTarget);
  }
  return resolvedTarget;
}

function createStyles(): string {
  return `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    }

    .octo-sidebar-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: ${SIDEBAR_Z_INDEX};
    }

    .octo-sidebar-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.25);
      opacity: 0;
      transition: opacity 0.25s ease;
      pointer-events: none;
    }

    .octo-sidebar-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    .octo-sidebar-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 480px;
      background: #fff;
      box-shadow: -8px 0 40px rgba(15, 23, 42, 0.18);
      transform: translateX(100%);
      transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
      pointer-events: auto;
      display: flex;
      flex-direction: column;
    }

    .octo-sidebar-panel.open {
      transform: translateX(0);
    }

    .octo-sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fbff;
      flex-shrink: 0;
    }

    .octo-sidebar-title {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
      margin: 0;
    }

    .octo-sidebar-close {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease;
    }

    .octo-sidebar-close:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    .octo-sidebar-iframe {
      flex: 1 1 auto;
      width: 100%;
      border: none;
      display: block;
    }

    .octo-trigger {
      position: fixed;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #fff;
      border: 1px solid rgba(226, 232, 240, 0.9);
      box-shadow: 0 6px 20px rgba(15, 23, 42, 0.14), 0 2px 6px rgba(15, 23, 42, 0.08);
      cursor: pointer;
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      overflow: hidden;
    }

    .octo-trigger:hover {
      transform: translateY(-50%) scale(1.06);
      box-shadow: 0 8px 26px rgba(37, 99, 235, 0.22), 0 3px 10px rgba(15, 23, 42, 0.1);
    }

    .octo-trigger:active {
      transform: translateY(-50%) scale(0.98);
    }

    .octo-trigger img {
      width: 28px;
      height: 28px;
      display: block;
    }

    .octo-shortcut-hint {
      position: absolute;
      right: 56px;
      top: 50%;
      transform: translateY(-50%);
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(15, 23, 42, 0.85);
      color: #fff;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }

    .octo-trigger:hover .octo-shortcut-hint {
      opacity: 1;
    }
  `;
}

function createTriggerButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "octo-trigger";
  btn.setAttribute("aria-label", "打开 Tenways Octo 侧边栏");
  btn.setAttribute("title", "Tenways Octo (Ctrl+M)");

  const img = document.createElement("img");
  img.src = getIconUrl();
  img.alt = "Tenways Octo";
  btn.appendChild(img);

  const hint = document.createElement("span");
  hint.className = "octo-shortcut-hint";
  hint.textContent = "Ctrl+M";
  btn.appendChild(hint);

  return btn;
}

function createSidebarPanel(context?: SidebarHostContext): { root: HTMLDivElement; backdrop: HTMLDivElement; panel: HTMLDivElement; iframe: HTMLIFrameElement; closeBtn: HTMLButtonElement } {
  const root = document.createElement("div");
  root.className = "octo-sidebar-root";

  const backdrop = document.createElement("div");
  backdrop.className = "octo-sidebar-backdrop";
  root.appendChild(backdrop);

  const panel = document.createElement("div");
  panel.className = "octo-sidebar-panel";

  const header = document.createElement("div");
  header.className = "octo-sidebar-header";

  const title = document.createElement("h2");
  title.className = "octo-sidebar-title";
  title.textContent = "Tenways Octo";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "octo-sidebar-close";
  closeBtn.setAttribute("aria-label", "关闭");
  closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  header.appendChild(closeBtn);

  panel.appendChild(header);

  const iframe = document.createElement("iframe");
  iframe.className = "octo-sidebar-iframe";
  iframe.src = getPopupUrl(context);
  iframe.setAttribute("allow", "clipboard-write");
  panel.appendChild(iframe);

  root.appendChild(panel);

  return { root, backdrop, panel, iframe, closeBtn };
}

export function injectSidebar(context?: SidebarHostContext): SidebarInjectorHandle {
  const host = ensureShadowHost();
  let shadow = host.shadowRoot;
  if (!shadow) {
    shadow = host.attachShadow({ mode: "open" });
  }

  // Clean up any existing content
  shadow.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = createStyles();
  shadow.appendChild(style);

  const trigger = createTriggerButton();
  const { root: sidebarRoot, backdrop, panel, closeBtn } = createSidebarPanel(context);
  shadow.appendChild(trigger);
  shadow.appendChild(sidebarRoot);

  let isOpen = false;

  function open() {
    if (isOpen) return;
    isOpen = true;
    backdrop.classList.add("open");
    panel.classList.add("open");
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.classList.remove("open");
    panel.classList.remove("open");
  }

  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  function onTriggerClick(e: Event) {
    e.stopPropagation();
    toggle();
  }

  function onBackdropClick(e: Event) {
    if (e.target === backdrop) {
      close();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    // Ctrl+M or Cmd+M
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
      e.preventDefault();
      toggle();
    }
    // Escape to close
    if (e.key === "Escape" && isOpen) {
      close();
    }
  }

  trigger.addEventListener("click", onTriggerClick);
  backdrop.addEventListener("click", onBackdropClick);
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", onKeyDown, true);

  function destroy() {
    trigger.removeEventListener("click", onTriggerClick);
    backdrop.removeEventListener("click", onBackdropClick);
    closeBtn.removeEventListener("click", close);
    document.removeEventListener("keydown", onKeyDown, true);
    host.remove();
  }

  return {
    open,
    close,
    toggle,
    destroy,
  };
}
