import type { InjectionAdapter } from "../types";
import { createDefaultObserverFactory, type ObserverFactory } from "./observer";

export type ProbeController<TContext> = {
  refresh(): void;
  destroy(): void;
};

export function isInjectionProbeEnabled(): boolean {
  const env = import.meta.env;
  return Boolean(env.DEV) && env.WXT_PUBLIC_INJECTION_PROBE === "true";
}

export type CreateProbeControllerDeps<TContext> = {
  adapter: InjectionAdapter<TContext>;
  observerFactory?: ObserverFactory;
};

export function createProbeController<TContext>({
  adapter,
  observerFactory = createDefaultObserverFactory(),
}: CreateProbeControllerDeps<TContext>): ProbeController<TContext> {
  let destroyed = false;
  let shellRoot: Element | null = null;
  let detailRoot: Element | null = null;
  let cleanupShellObserver: (() => void) | null = null;
  let cleanupDetailObserver: (() => void) | null = null;

  function syncShellObserver(nextShellRoot: Element | null) {
    if (shellRoot === nextShellRoot) {
      return;
    }

    cleanupShellObserver?.();
    cleanupShellObserver = null;
    shellRoot = nextShellRoot;

    if (nextShellRoot !== null) {
      cleanupShellObserver = observerFactory.observeShell(nextShellRoot, refresh);
    }
  }

  function syncDetailObserver(nextDetailRoot: Element | null) {
    if (detailRoot === nextDetailRoot) {
      return;
    }

    cleanupDetailObserver?.();
    cleanupDetailObserver = null;
    detailRoot = nextDetailRoot;

    if (nextDetailRoot !== null) {
      cleanupDetailObserver = observerFactory.observeDetail(nextDetailRoot, refresh);
    }
  }

  function refresh() {
    if (destroyed) {
      return;
    }

    const shell = adapter.probeShell();
    syncShellObserver(shell.shellRoot);

    const detail = adapter.probeDetail();
    if (!detail.isOpen || !detail.detailRoot) {
      syncDetailObserver(null);
      adapter.render({
        pageState: { kind: "detail-closed" },
      });
      return;
    }

    syncDetailObserver(detail.detailRoot);

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
    cleanupShellObserver?.();
    cleanupShellObserver = null;
    cleanupDetailObserver?.();
    cleanupDetailObserver = null;
    adapter.cleanup?.();
  }

  return { refresh, destroy };
}
