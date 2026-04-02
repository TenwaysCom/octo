const MOUNT_ATTR = "data-tenways-octo-mount";

function getMountSelector(id: string): string {
  return `[${MOUNT_ATTR}="${id}"]`;
}

function createMountNode(id: string): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute(MOUNT_ATTR, id);
  return node;
}

export function ensureMountedNode(id: string, anchor: Element): HTMLElement {
  const existing = anchor.querySelector<HTMLElement>(getMountSelector(id));
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
  anchor.querySelectorAll(getMountSelector(id)).forEach((node) => {
    node.remove();
  });
}
