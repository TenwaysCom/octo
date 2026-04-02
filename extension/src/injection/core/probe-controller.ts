import type { InjectionAdapter } from "../types";

export type ProbeController<TContext> = {
  refresh(): void;
  destroy(): void;
};

export type CreateProbeControllerDeps<TContext> = {
  adapter: InjectionAdapter<TContext>;
};

export function createProbeController<TContext>({
  adapter,
}: CreateProbeControllerDeps<TContext>): ProbeController<TContext> {
  let destroyed = false;

  function refresh() {
    if (destroyed) {
      return;
    }

    adapter.probeShell();

    const detail = adapter.probeDetail();
    if (!detail.isOpen || !detail.detailRoot) {
      adapter.render({
        pageState: { kind: "detail-loading" },
        context: null,
        anchor: null,
      });
      return;
    }

    const context = adapter.probeContext(detail.detailRoot);
    const anchor = adapter.probeAnchor(detail.detailRoot);

    if (context && anchor) {
      adapter.render({
        pageState: { kind: "detail-ready", context, anchor },
        context,
        anchor,
      });
      return;
    }

    adapter.render({
      pageState: { kind: "detail-loading" },
      context,
      anchor,
    });
  }

  function destroy() {
    destroyed = true;
    adapter.cleanup?.();
  }

  return { refresh, destroy };
}
