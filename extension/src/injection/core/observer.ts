export type ScopedObserverCleanup = () => void;

export type ScopedObserverFactory = (
  target: Element,
  onChange: () => void,
) => ScopedObserverCleanup;

export type ObserverFactory = {
  observeShell: ScopedObserverFactory;
  observeDetail: ScopedObserverFactory;
};

export function createScopedObserver(target: Element, onChange: () => void): ScopedObserverCleanup {
  const observer = new MutationObserver(onChange);

  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  return () => {
    observer.disconnect();
  };
}

export function createDefaultObserverFactory(): ObserverFactory {
  return {
    observeShell: createScopedObserver,
    observeDetail: createScopedObserver,
  };
}
