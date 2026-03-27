import { describe, expect, it } from "vitest";
import {
  buildPopupHeaderContext,
  createPopupViewModel,
  detectPopupPageType,
} from "./view-model.js";

describe("popup view model", () => {
  it("detects a Meegle popup context from meegle hosts", () => {
    expect(detectPopupPageType("https://tenant.meegle.com/workitem/123")).toBe("meegle");
    expect(detectPopupPageType("https://project.larksuite.com/story/detail")).toBe("meegle");
  });

  it("detects a Lark popup context from Lark hosts", () => {
    expect(detectPopupPageType("https://foo.feishu.cn/base/abc")).toBe("lark");
    expect(detectPopupPageType("https://www.larksuite.com/wiki/xyz")).toBe("lark");
  });

  it("marks non-supported pages as unsupported", () => {
    expect(detectPopupPageType("https://github.com/tenways/tw-itdog")).toBe("unsupported");
  });

  it("builds a compact header context from platform, module, task, and status", () => {
    expect(
      buildPopupHeaderContext({
        platform: "Lark",
        module: "A1",
        task: "Generate Draft",
        status: "Running",
      }),
    ).toBe("Lark · A1 · Generate Draft · Running");
  });

  it("skips empty header context segments", () => {
    expect(
      buildPopupHeaderContext({
        platform: "Meegle",
        module: "",
        task: null,
        status: "Ready",
      }),
    ).toBe("Meegle · Ready");
  });

  it("shows the Lark feature actions only when both auth states are ready on a Lark page", () => {
    expect(
      createPopupViewModel({
        pageType: "lark",
        identity: {
          larkId: "ou_xxx",
          meegleUserKey: "user_xxx",
        },
        isAuthed: {
          lark: true,
          meegle: true,
        },
      }),
    ).toMatchObject({
      subtitle: "Lark",
      showUnsupported: false,
      showAuthBlockTop: true,
      showAuthBlockBottom: true,
      showLarkFeatureBlock: true,
      showMeegleFeatureBlock: false,
      canAnalyze: true,
      canDraft: true,
      canApply: true,
    });
  });

  it("shows the Meegle feature action only when both auth states are ready on a Meegle page", () => {
    expect(
      createPopupViewModel({
        pageType: "meegle",
        identity: {
          larkId: "ou_xxx",
          meegleUserKey: "user_xxx",
        },
        isAuthed: {
          lark: true,
          meegle: true,
        },
      }),
    ).toMatchObject({
      subtitle: "Meegle",
      showUnsupported: false,
      showAuthBlockTop: true,
      showAuthBlockBottom: true,
      showLarkFeatureBlock: false,
      showMeegleFeatureBlock: true,
      canAnalyze: false,
      canDraft: false,
      canApply: false,
    });
  });

  it("keeps feature actions hidden until both auth states are ready", () => {
    expect(
      createPopupViewModel({
        pageType: "lark",
        identity: {
          larkId: "ou_xxx",
          meegleUserKey: undefined,
        },
        isAuthed: {
          lark: true,
          meegle: false,
        },
      }),
    ).toMatchObject({
      showAuthBlockTop: true,
      showAuthBlockBottom: false,
      showLarkFeatureBlock: false,
      showMeegleFeatureBlock: false,
      canAnalyze: false,
      canDraft: false,
      canApply: false,
    });
  });

  it("uses the unsupported subtitle and hides auth sections on unsupported pages", () => {
    expect(
      createPopupViewModel({
        pageType: "unsupported",
        identity: {
          larkId: null,
          meegleUserKey: null,
        },
        isAuthed: {
          lark: false,
          meegle: false,
        },
      }),
    ).toMatchObject({
      subtitle: "不支持",
      showUnsupported: true,
      showAuthBlockTop: false,
      showAuthBlockBottom: false,
      showLarkFeatureBlock: false,
      showMeegleFeatureBlock: false,
    });
  });
});
