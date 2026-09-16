// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createScopedObserver } from "./observer";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createScopedObserver", () => {
  it("ignores mutations inside Tenways-owned mount nodes", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const onChange = vi.fn();
    const cleanup = createScopedObserver(root, onChange);

    const mount = document.createElement("div");
    mount.setAttribute("data-tenways-octo-mount", "probe");
    root.appendChild(mount);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).not.toHaveBeenCalled();

    mount.appendChild(document.createElement("span"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).not.toHaveBeenCalled();

    const external = document.createElement("span");
    root.appendChild(external);

    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    cleanup();
  });
});
