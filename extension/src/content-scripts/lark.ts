import { createLarkContentScriptRuntime, type LarkDetectedPageContext } from "../injection/platforms/lark/bootstrap";
import type { ProbeOverlayState } from "../injection/core/overlay";
import { fetchExtensionPageConfig } from "./shared/page-config";
import { injectSidebar, type SidebarInjectorHandle } from "./shared/sidebar-injector";

function createNoopSidebarHandle(): SidebarInjectorHandle {
  return {
    open() {},
    close() {},
    toggle() {},
    destroy() {},
  };
}

interface TenwaysLarkTestingApi {
  detectLarkPageContext: () => LarkDetectedPageContext | null;
  extractAuthCodeFromRedirect: () => { code: string; state: string } | null;
  getLarkUserId: () => string | null;
  initLarkContentScript: () => void;
  refreshProbeState: () => void;
  getProbeState: () => ProbeOverlayState;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  destroy: () => void;
}

const runtime = createLarkContentScriptRuntime();

const larkTestingTarget = globalThis as typeof globalThis & {
  __TENWAYS_LARK_TESTING__?: TenwaysLarkTestingApi;
};

runtime.initLarkContentScript();

let larkSidebar = createNoopSidebarHandle();
let larkSidebarDestroyed = false;

void (async () => {
  const pageConfig = await fetchExtensionPageConfig({
    url: typeof window !== "undefined" ? window.location.href : undefined,
    fallbackPlatform: "lark",
  });

  if (larkSidebarDestroyed || !pageConfig.sidebar.injectPageElements) {
    return;
  }

  larkSidebar = injectSidebar(
    {
      hostPageType: "lark",
      hostUrl: typeof window !== "undefined" ? window.location.href : undefined,
      hostOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      larkUserId: runtime.getLarkUserId() ?? undefined,
    },
    {
      showTrigger: pageConfig.sidebar.sidebarButtonEnabled,
      enableKeyboardShortcut: pageConfig.sidebar.keyboardShortcutEnabled,
    },
  );
})();

larkTestingTarget.__TENWAYS_LARK_TESTING__ = {
  detectLarkPageContext: runtime.detectLarkPageContext,
  extractAuthCodeFromRedirect: runtime.extractAuthCodeFromRedirect,
  getLarkUserId: runtime.getLarkUserId,
  initLarkContentScript: runtime.initLarkContentScript,
  refreshProbeState: runtime.refreshProbeState,
  getProbeState: runtime.getProbeState,
  openSidebar: () => larkSidebar.open(),
  closeSidebar: () => larkSidebar.close(),
  toggleSidebar: () => larkSidebar.toggle(),
  destroy: () => {
    larkSidebarDestroyed = true;
    larkSidebar.destroy();
    runtime.destroy();
  },
};

export {};
