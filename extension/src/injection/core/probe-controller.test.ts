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

    expect(render).toHaveBeenCalledWith({ pageState: { kind: "detail-ready", context, anchor } });
  });

  it("emits detail-loading and skips detail probes when the detail is closed", () => {
    const render = vi.fn();
    const probeContext = vi.fn();
    const probeAnchor = vi.fn();
    const controller = createProbeController({
      adapter: {
        probeShell: () => ({ shellRoot: document.body, overlayRoot: document.body }),
        probeDetail: () => ({ isOpen: false, detailRoot: null }),
        probeContext,
        probeAnchor,
        render,
      },
    });

    controller.refresh();

    expect(render).toHaveBeenCalledWith({ pageState: { kind: "detail-closed" } });
    expect(probeContext).not.toHaveBeenCalled();
    expect(probeAnchor).not.toHaveBeenCalled();
  });

  it("emits detail-loading when detail is open but context is still missing", () => {
    const render = vi.fn();
    const probeContext = vi.fn(() => null);
    const probeAnchor = vi.fn(() => ({
      element: document.body,
      label: "detail-header",
      confidence: 1,
    }));
    const controller = createProbeController({
      adapter: {
        probeShell: () => ({ shellRoot: document.body, overlayRoot: document.body }),
        probeDetail: () => ({ isOpen: true, detailRoot: document.body }),
        probeContext,
        probeAnchor,
        render,
      },
    });

    controller.refresh();

    expect(render).toHaveBeenCalledWith({ pageState: { kind: "detail-loading" } });
    expect(probeContext).toHaveBeenCalledWith(document.body);
    expect(probeAnchor).toHaveBeenCalledWith(document.body);
  });

  it("switches the detail observer when the detail root changes", () => {
    const render = vi.fn();
    const shellCleanup = vi.fn();
    const firstDetailCleanup = vi.fn();
    const secondDetailCleanup = vi.fn();
    const observeShell = vi.fn(() => shellCleanup);
    const observeDetail = vi
      .fn()
      .mockReturnValueOnce(firstDetailCleanup)
      .mockReturnValueOnce(secondDetailCleanup);
    const firstDetailRoot = document.createElement("section");
    const secondDetailRoot = document.createElement("section");
    const probeDetail = vi
      .fn()
      .mockReturnValueOnce({ isOpen: true, detailRoot: firstDetailRoot })
      .mockReturnValueOnce({ isOpen: true, detailRoot: secondDetailRoot });

    const controller = createProbeController({
      adapter: {
        probeShell: () => ({ shellRoot: document.body, overlayRoot: document.body }),
        probeDetail,
        probeContext: () => ({ title: "Burger" }),
        probeAnchor: () => ({
          element: document.body,
          label: "detail-header",
          confidence: 1,
        }),
        render,
      },
      observerFactory: {
        observeShell,
        observeDetail,
      },
    });

    controller.refresh();
    controller.refresh();

    expect(observeDetail).toHaveBeenCalledTimes(2);
    expect(observeDetail).toHaveBeenNthCalledWith(1, firstDetailRoot, expect.any(Function));
    expect(observeDetail).toHaveBeenNthCalledWith(2, secondDetailRoot, expect.any(Function));
    expect(firstDetailCleanup).toHaveBeenCalledTimes(1);
    expect(secondDetailCleanup).not.toHaveBeenCalled();
    expect(shellCleanup).not.toHaveBeenCalled();
  });

  it("calls both observer cleanups on destroy", () => {
    const render = vi.fn();
    const shellCleanup = vi.fn();
    const detailCleanup = vi.fn();
    const probeShell = vi.fn(() => ({ shellRoot: document.body, overlayRoot: document.body }));
    const probeDetail = vi.fn(() => ({ isOpen: true, detailRoot: document.body }));
    const probeContext = vi.fn(() => ({ title: "Burger" }));
    const probeAnchor = vi.fn(() => ({
      element: document.body,
      label: "detail-header",
      confidence: 1,
    }));
    const observeShell = vi.fn(() => shellCleanup);
    const observeDetail = vi.fn(() => detailCleanup);
    const controller = createProbeController({
      adapter: {
        probeShell,
        probeDetail,
        probeContext,
        probeAnchor,
        render,
      },
      observerFactory: {
        observeShell,
        observeDetail,
      },
    });

    controller.refresh();
    controller.destroy();

    expect(shellCleanup).toHaveBeenCalledTimes(1);
    expect(detailCleanup).toHaveBeenCalledTimes(1);
    expect(observeShell).toHaveBeenCalledTimes(1);
    expect(observeDetail).toHaveBeenCalledTimes(1);
    expect(probeShell).toHaveBeenCalledTimes(1);
    expect(probeDetail).toHaveBeenCalledTimes(1);
    expect(probeContext).toHaveBeenCalledTimes(1);
    expect(probeAnchor).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
