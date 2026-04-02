// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createProbeController } from "./probe-controller";

describe("createProbeController", () => {
  it("emits detail-ready when detail, context, and anchor are all present", () => {
    const render = vi.fn();
    const controller = createProbeController({
      adapter: {
        probeShell: () => ({ shellRoot: document.body, overlayRoot: document.body }),
        probeDetail: () => ({ isOpen: true, detailRoot: document.body }),
        probeContext: () => ({ title: "Burger" }),
        probeAnchor: () => ({ element: document.body, label: "detail-header", confidence: 1 }),
        render,
      },
    });

    controller.refresh();

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        pageState: expect.objectContaining({ kind: "detail-ready" }),
      }),
    );
  });
});
