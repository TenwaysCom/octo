import "ant-design-vue/dist/reset.css";
import { createLarkContentScriptRuntime, type LarkDetectedPageContext } from "../injection/platforms/lark/bootstrap";
import type { ProbeOverlayState } from "../injection/core/overlay";
import { injectSidebar } from "./shared/sidebar-injector";

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

// Inject floating sidebar trigger on Lark pages
const larkSidebar = injectSidebar();

larkTestingTarget.__TENWAYS_LARK_TESTING__ = {
  detectLarkPageContext: runtime.detectLarkPageContext,
  extractAuthCodeFromRedirect: runtime.extractAuthCodeFromRedirect,
  getLarkUserId: runtime.getLarkUserId,
  initLarkContentScript: runtime.initLarkContentScript,
  refreshProbeState: runtime.refreshProbeState,
  getProbeState: runtime.getProbeState,
  openSidebar: larkSidebar.open,
  closeSidebar: larkSidebar.close,
  toggleSidebar: larkSidebar.toggle,
  destroy: () => {
    larkSidebar.destroy();
    runtime.destroy();
  },
};

export {};
