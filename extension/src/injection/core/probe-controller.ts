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
      });
      return;
    }

    const context = adapter.probeContext(detail.detailRoot);
    const anchor = adapter.probeAnchor(detail.detailRoot);

    if (context !== null && anchor !== null) {
      adapter.render({
        pageState: { kind: "detail-ready", context, anchor },
      });
      return;
    }

    adapter.render({
      pageState: { kind: "detail-loading" },
    });
  }

  function destroy() {
    destroyed = true;
    adapter.cleanup?.();
  }

  return { refresh, destroy };
}
