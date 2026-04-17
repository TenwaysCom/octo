import type { InjectionAdapter, InjectionPageState } from "../../types";
import { probeLarkAnchor, probeLarkContext, probeLarkDetail, type LarkRecordContext } from "./probe";
import { createLarkInjectionRenderer, type LarkInjectionRenderer, type LarkInjectionRendererDeps } from "./render";

export type PageStateWithDetail = {
  pageState: InjectionPageState<LarkRecordContext>;
  detail: ReturnType<typeof probeLarkDetail>;
  parsedContext: LarkRecordContext | null;
};

export type LarkProbeAdapterDeps = {
  onPageState?: (state: PageStateWithDetail) => void;
  renderer?: LarkInjectionRenderer;
} & LarkInjectionRendererDeps;

export function createLarkInjectionAdapter({
  onPageState,
  renderer,
  pageContext,
  getPageContext,
  createWorkitem,
}: LarkProbeAdapterDeps = {}): InjectionAdapter<LarkRecordContext> {
  const activeRenderer = renderer ?? createLarkInjectionRenderer({
    pageContext,
    getPageContext,
    createWorkitem,
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
      const detail = probeLarkDetail();
      const parsedContext = state.pageState.kind !== "detail-closed" && detail.detailRoot
        ? probeLarkContext(detail.detailRoot)
        : null;
      onPageState?.({ pageState: state.pageState, detail, parsedContext });
      activeRenderer.render(state);
    },
    cleanup() {
      activeRenderer.cleanup();
    },
  };
}
