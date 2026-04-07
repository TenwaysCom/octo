import { MOUNT_ATTR } from "./mount";

export type ScopedObserverCleanup = () => void;

export type ScopedObserverFactory = (
  target: Element,
  onChange: () => void,
) => ScopedObserverCleanup;

export type ObserverFactory = {
  observeShell: ScopedObserverFactory;
  observeDetail: ScopedObserverFactory;
};

function isOwnedMutationTarget(node: Node): boolean {
  let current: Node | null = node;

  while (current !== null) {
    if (current.nodeType === Node.ELEMENT_NODE && (current as Element).hasAttribute(MOUNT_ATTR)) {
      return true;
    }

    current = current.parentNode;
  }

  return false;
}

function shouldNotify(records: MutationRecord[]): boolean {
  return records.some((record) => {
    if (isOwnedMutationTarget(record.target)) {
      return false;
    }

    if (record.type !== "childList") {
      return true;
    }

    const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
    if (nodes.length === 0) {
      return true;
    }

    return nodes.some((node) => !isOwnedMutationTarget(node));
  });
}

export function createScopedObserver(target: Element, onChange: () => void): ScopedObserverCleanup {
  const observer = new MutationObserver((records) => {
    if (shouldNotify(records)) {
      onChange();
    }
  });

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
