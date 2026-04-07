export const MOUNT_ATTR = "data-tenways-octo-mount";

function hasMountId(node: Element, id: string): boolean {
  return node.getAttribute(MOUNT_ATTR) === id;
}

function createMountNode(id: string): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute(MOUNT_ATTR, id);
  return node;
}

export function isTenwaysOwnedNode(node: Node): boolean {
  let current: Node | null = node;

  while (current !== null) {
    if (current.nodeType === Node.ELEMENT_NODE && (current as Element).hasAttribute(MOUNT_ATTR)) {
      return true;
    }

    current = current.parentNode;
  }

  return false;
}

function findDirectMountedChild(id: string, anchor: Element): HTMLElement | null {
  for (const child of Array.from(anchor.children)) {
    if (hasMountId(child, id)) {
      return child as HTMLElement;
    }
  }

  return null;
}

export function ensureMountedNode(id: string, anchor: Element): HTMLElement {
  const existing = findDirectMountedChild(id, anchor);
  if (existing !== null) {
    return existing;
  }

  const node = createMountNode(id);
  anchor.appendChild(node);
  return node;
}

export function remountNode(id: string, anchor: Element): HTMLElement {
  cleanupMountedNode(id, anchor);
  return ensureMountedNode(id, anchor);
}

export function cleanupMountedNode(id: string, anchor: Element): void {
  for (const child of Array.from(anchor.children)) {
    if (hasMountId(child, id)) {
      child.remove();
    }
  }
}
