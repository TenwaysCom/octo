import type { InjectionAdapter, InjectionPageState } from "../../types";
import { probeLarkAnchor, probeLarkContext, probeLarkDetail, type LarkRecordContext } from "./probe";
import { createLarkInjectionRenderer, type LarkInjectionRenderer, type LarkInjectionRendererDeps } from "./render";

export type LarkProbeAdapterDeps = {
  onPageState?: (state: InjectionPageState<LarkRecordContext>) => void;
  renderer?: LarkInjectionRenderer;
} & LarkInjectionRendererDeps;

export function createLarkInjectionAdapter({
  onPageState,
  renderer,
  pageContext,
  getPageContext,
  requestDraft,
  applyDraft,
}: LarkProbeAdapterDeps = {}): InjectionAdapter<LarkRecordContext> {
  const activeRenderer = renderer ?? createLarkInjectionRenderer({
    pageContext,
    getPageContext,
    requestDraft,
    applyDraft,
  });

  return {
    probeShell() {
      if (typeof document === "undefined") {
        return {
          shellRoot: null,
          overlayRoot: null,
        };
      }

      const shellRoot = document.body ?? document.documentElement;
      return {
        shellRoot,
        overlayRoot: shellRoot,
      };
    },
    probeDetail: probeLarkDetail,
    probeContext: probeLarkContext,
    probeAnchor: probeLarkAnchor,
    render(state) {
      onPageState?.(state.pageState);
      activeRenderer.render(state);
    },
    cleanup() {
      activeRenderer.cleanup();
    },
  };
}
