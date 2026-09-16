// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanupMountedNode, ensureMountedNode, remountNode } from "./mount";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mount helpers", () => {
  it("prefers a direct mounted child over a nested descendant", () => {
    const anchor = document.createElement("section");
    const wrapper = document.createElement("div");
    const nestedMount = document.createElement("div");
    nestedMount.setAttribute("data-tenways-octo-mount", "probe");
    wrapper.appendChild(nestedMount);
    anchor.appendChild(wrapper);

    const directMount = document.createElement("div");
    directMount.setAttribute("data-tenways-octo-mount", "probe");
    anchor.appendChild(directMount);

    const mounted = ensureMountedNode("probe", anchor);

    expect(mounted).toBe(directMount);
    expect(anchor.children).toHaveLength(2);
  });

  it("removes only direct mounted children during cleanup", () => {
    const anchor = document.createElement("section");
    const wrapper = document.createElement("div");
    const nestedMount = document.createElement("div");
    nestedMount.setAttribute("data-tenways-octo-mount", "probe");
    wrapper.appendChild(nestedMount);
    anchor.appendChild(wrapper);

    const directMount = document.createElement("div");
    directMount.setAttribute("data-tenways-octo-mount", "probe");
    anchor.appendChild(directMount);

    cleanupMountedNode("probe", anchor);

    expect(anchor.contains(directMount)).toBe(false);
    expect(anchor.contains(nestedMount)).toBe(true);
  });

  it("remountNode replaces the direct mounted child", () => {
    const anchor = document.createElement("section");
    const firstMount = ensureMountedNode("probe", anchor);

    const remounted = remountNode("probe", anchor);

    expect(remounted).not.toBe(firstMount);
    expect(anchor.children).toHaveLength(1);
    expect(anchor.firstElementChild).toBe(remounted);
  });
});
