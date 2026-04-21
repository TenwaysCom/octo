import type { InjectionAdapter, InjectionPageState } from "../../types";
import { probeLarkAnchor, probeLarkContext, probeLarkDetail, probeLarkWikiRecordContext, probeLarkWikiContext, probeLarkWikiAnchor, type LarkRecordContext } from "./probe";
import { createLarkInjectionRenderer, type LarkInjectionRenderer, type LarkInjectionRendererDeps } from "./render";
import { extractLarkBaseContextFromUrl } from "../../../lark-base-url.js";

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

  // Determine if we're on a wiki record page
  function isWikiRecordPage(): boolean {
    if (typeof window !== "undefined") {
      const routeContext = extractLarkBaseContextFromUrl(window.location.href);
      return !!routeContext.wikiRecordId;
    }
    return false;
  }

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
    probeDetail() {
      return isWikiRecordPage() ? probeLarkWikiRecordContext() : probeLarkDetail();
    },
    probeContext(detailRoot) {
      return isWikiRecordPage()
        ? probeLarkWikiContext(detailRoot)
        : probeLarkContext(detailRoot);
    },
    probeAnchor(detailRoot) {
      return isWikiRecordPage()
        ? probeLarkWikiAnchor(detailRoot)
        : probeLarkAnchor(detailRoot);
    },
    render(state) {
      const detail = isWikiRecordPage() ? probeLarkWikiRecordContext() : probeLarkDetail();
      const parsedContext = state.pageState.kind !== "detail-closed" && detail.detailRoot
        ? (isWikiRecordPage()
          ? probeLarkWikiContext(detail.detailRoot)
          : probeLarkContext(detail.detailRoot))
        : null;
      onPageState?.({ pageState: state.pageState, detail, parsedContext });
      activeRenderer.render(state);
    },
    cleanup() {
      activeRenderer.cleanup();
    },
  };
}
