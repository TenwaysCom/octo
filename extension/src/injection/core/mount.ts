export const MOUNT_ATTR = "data-tenways-octo-mount";

function hasMountId(node: Element, id: string): boolean {
  return node.getAttribute(MOUNT_ATTR) === id;
}

function createMountNode(id: string): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute(MOUNT_ATTR, id);
  return node;
}

function insertAfter(node: HTMLElement, anchor: Element): void {
  anchor.parentElement?.insertBefore(node, anchor.nextSibling);
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

export function ensureMountedSiblingNode(id: string, anchor: Element): HTMLElement {
  const parent = anchor.parentElement;
  if (parent === null) {
    return ensureMountedNode(id, anchor);
  }

  const nextSibling = anchor.nextElementSibling;
  if (nextSibling !== null && hasMountId(nextSibling, id)) {
    return nextSibling as HTMLElement;
  }

  cleanupMountedNode(id, parent);

  const node = createMountNode(id);
  insertAfter(node, anchor);
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
