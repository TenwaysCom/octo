// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createProbeController } from "./probe-controller";

describe("createProbeController", () => {
  it("emits detail-ready when detail, context, and anchor are all present", () => {
    const render = vi.fn();
    const context = { title: "Burger" };
    const anchor = { element: document.body, label: "detail-header", confidence: 1 };
    const controller = createProbeController({
      adapter: {
        probeShell: () => ({ shellRoot: document.body, overlayRoot: document.body }),
        probeDetail: () => ({ isOpen: true, detailRoot: document.body }),
        probeContext: () => context,
        probeAnchor: () => anchor,
        render,
      },
    });

    controller.refresh();

    expect(render).toHaveBeenCalledWith({
      pageState: { kind: "detail-ready", context, anchor },
      context,
      anchor,
    });
  });
});
