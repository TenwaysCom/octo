import { createLarkContentScriptRuntime, type LarkDetectedPageContext } from "../injection/platforms/lark/bootstrap";
import type { ProbeOverlayState } from "../injection/core/overlay";

interface TenwaysLarkTestingApi {
  detectLarkPageContext: () => LarkDetectedPageContext | null;
  extractAuthCodeFromRedirect: () => { code: string; state: string } | null;
  getLarkUserId: () => string | null;
  initLarkContentScript: () => void;
  refreshProbeState: () => void;
  getProbeState: () => ProbeOverlayState;
}

const runtime = createLarkContentScriptRuntime();

const larkTestingTarget = globalThis as typeof globalThis & {
  __TENWAYS_LARK_TESTING__?: TenwaysLarkTestingApi;
};

larkTestingTarget.__TENWAYS_LARK_TESTING__ = {
  detectLarkPageContext: runtime.detectLarkPageContext,
  extractAuthCodeFromRedirect: runtime.extractAuthCodeFromRedirect,
  getLarkUserId: runtime.getLarkUserId,
  initLarkContentScript: runtime.initLarkContentScript,
  refreshProbeState: runtime.refreshProbeState,
  getProbeState: runtime.getProbeState,
};

runtime.initLarkContentScript();

export {};
