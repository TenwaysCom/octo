// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createLarkInjectionRenderer, renderLarkInjection } from "./render";
import type { LarkRecordContext } from "./probe";

afterEach(() => {
  document.body.innerHTML = "";
});

function createContext(title: string): LarkRecordContext {
  return {
    title,
    fields: [
      { label: "Status", value: "Testing" },
      { label: "Priority", value: "P1" },
    ],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function userClick(element: Element | null): Promise<void> {
  expect(element).not.toBeNull();
  (element as HTMLButtonElement).click();
  await flushPromises();
}

describe("renderLarkInjection", () => {
  const context = createContext("Burger 出库对接2");

  it("renders a send-to-meegle button in the header anchor", () => {
    const anchor = document.createElement("div");

    renderLarkInjection({
      pageState: {
        kind: "detail-ready",
        context,
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
      context,
      anchor: { element: anchor, label: "detail-header", confidence: 1 },
    });

    expect(anchor.textContent).toContain("发送到 Meegle");
  });

  it("expands the collapsible panel after clicking the button", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);
    const requestDraft = vi.fn().mockResolvedValue({
      draftId: "draft_b2_rec_expand",
      draftType: "b2",
      sourceRef: {
        sourcePlatform: "lark_a1",
        sourceRecordId: "rec_expand",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "bug",
        templateId: "production-bug",
      },
      name: "Burger 出库对接2",
      needConfirm: true,
      fieldValuePairs: [],
      ownerUserKeys: [],
      missingMeta: [],
    });

    renderLarkInjection({
      pageState: {
        kind: "detail-ready",
        context,
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
      deps: {
        requestDraft,
        pageContext: {
          pageType: "lark_a1",
          url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_expand",
          baseId: "app_xxx",
          tableId: "tbl_xxx",
          recordId: "rec_expand",
        },
      },
    });

    const button = anchor.querySelector("button");
    expect(button).not.toBeNull();
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="collapsed"]')).not.toBeNull();

    button?.click();
    await Promise.resolve();

    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="draft-ready"]')).not.toBeNull();
    expect(detailRoot.textContent).toContain("准备发送到 Meegle");
  });

  it("requests a draft when the action button is clicked", async () => {
    const anchor = document.createElement("div");
    const requestDraft = vi.fn().mockResolvedValue({
      draftId: "draft_b2_rec_xxx",
      draftType: "b2",
      sourceRef: {
        sourcePlatform: "lark_a1",
        sourceRecordId: "rec_xxx",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "bug",
        templateId: "production-bug",
      },
      name: "Burger 出库对接2",
      needConfirm: true,
      fieldValuePairs: [],
      ownerUserKeys: [],
      missingMeta: [],
    });

    renderLarkInjection({
      pageState: {
        kind: "detail-ready",
        context,
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
      deps: {
        requestDraft,
        pageContext: {
          pageType: "lark_a1",
          url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_xxx",
          baseId: "app_xxx",
          tableId: "tbl_xxx",
          recordId: "rec_xxx",
          operatorLarkId: "ou_test_123",
        },
      },
    });

    await userClick(anchor.querySelector("button"));

    expect(requestDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pageType: "lark_a1",
        recordId: "rec_xxx",
        operatorLarkId: "ou_test_123",
        snapshot: expect.objectContaining({
          title: "Burger 出库对接2",
        }),
      }),
    );
  });
});

describe("createLarkInjectionRenderer", () => {
  it("resets stale draft state when the same anchor renders a different context", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    const requestDraft = vi.fn().mockResolvedValue({
      draftId: "draft_b2_first",
      draftType: "b2",
      sourceRef: {
        sourcePlatform: "lark_a1",
        sourceRecordId: "rec_first",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "bug",
        templateId: "production-bug",
      },
      name: "First record",
      needConfirm: true,
      fieldValuePairs: [],
      ownerUserKeys: [],
      missingMeta: [],
    });

    const renderer = createLarkInjectionRenderer({
      requestDraft,
      pageContext: {
        pageType: "lark_a1",
        url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_first",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_first",
      },
    });
    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("First record"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    const button = anchor.querySelector("button");
    button?.click();
    await flushPromises();
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="draft-ready"]')).not.toBeNull();

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Second record"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    const panel = detailRoot.querySelector('[data-tenways-octo-mount="lark-detail-panel"]');
    expect(panel?.getAttribute("data-tenways-octo-panel-state")).toBe("collapsed");
    expect(panel?.textContent).not.toContain("First record");
  });

  it("ignores late draft completion after context changes or collapse", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    const firstDraft = createDeferred<{ title: string; fields: Array<{ label: string; value: string }> }>();
    const secondDraft = createDeferred<{ title: string; fields: Array<{ label: string; value: string }> }>();
    const requestDraft = vi
      .fn()
      .mockReturnValueOnce(firstDraft.promise)
      .mockReturnValueOnce(secondDraft.promise);

    const renderer = createLarkInjectionRenderer({ requestDraft });
    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("First record"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    anchor.querySelector("button")?.click();
    await flushPromises();
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="draft-loading"]')).not.toBeNull();

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Second record"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    firstDraft.resolve({ title: "First record", fields: [] });
    await flushPromises();

    let panel = detailRoot.querySelector('[data-tenways-octo-mount="lark-detail-panel"]');
    expect(panel?.getAttribute("data-tenways-octo-panel-state")).toBe("collapsed");
    expect(panel?.textContent).not.toContain("First record");

    anchor.querySelector("button")?.click();
    renderer.render({ pageState: { kind: "detail-closed" } });
    secondDraft.resolve({ title: "Second record", fields: [] });
    await flushPromises();

    panel = detailRoot.querySelector('[data-tenways-octo-mount="lark-detail-panel"]');
    expect(panel).toBeNull();
  });

  it("removes stale panel DOM when remounting after the old anchor is detached", () => {
    const firstContainer = document.createElement("section");
    const firstAnchor = document.createElement("div");
    firstContainer.appendChild(firstAnchor);
    document.body.appendChild(firstContainer);

    const renderer = createLarkInjectionRenderer();
    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("First record"),
        anchor: { element: firstAnchor, label: "detail-header", confidence: 1 },
      },
    });

    expect(firstContainer.querySelector('[data-tenways-octo-mount="lark-detail-panel"]')).not.toBeNull();

    firstAnchor.remove();

    const secondContainer = document.createElement("section");
    const secondAnchor = document.createElement("div");
    secondContainer.appendChild(secondAnchor);
    document.body.appendChild(secondContainer);

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Second record"),
        anchor: { element: secondAnchor, label: "detail-header", confidence: 1 },
      },
    });

    expect(firstContainer.querySelector('[data-tenways-octo-mount="lark-detail-panel"]')).toBeNull();
    expect(secondContainer.querySelector('[data-tenways-octo-mount="lark-detail-panel"]')).not.toBeNull();
  });

  it("applies the last successful draft from the draft-ready panel action", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    const draftPayload = {
      draftId: "draft_b2_rec_apply",
      draftType: "b2" as const,
      sourceRef: {
        sourcePlatform: "lark_a1" as const,
        sourceRecordId: "rec_apply",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "bug",
        templateId: "production-bug",
      },
      name: "Burger 出库对接2",
      needConfirm: true as const,
      fieldValuePairs: [
        { fieldKey: "priority", fieldValue: "P1" },
      ],
      ownerUserKeys: [],
      missingMeta: [],
    };
    const requestDraft = vi.fn().mockResolvedValue(draftPayload);
    const applyDraft = vi.fn().mockResolvedValue({
      status: "created",
      workitemId: "B2-123",
      draft: draftPayload,
    });

    const renderer = createLarkInjectionRenderer({
      requestDraft,
      applyDraft,
      pageContext: {
        pageType: "lark_a1",
        url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_apply",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_apply",
        operatorLarkId: "ou_test_apply",
      },
    });

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Burger 出库对接2"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    await userClick(anchor.querySelector("button"));
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="draft-ready"]')).not.toBeNull();

    await userClick(detailRoot.querySelector('[data-tenways-octo-trigger="apply-to-meegle"]'));

    expect(applyDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pageType: "lark_a1",
        recordId: "rec_apply",
        operatorLarkId: "ou_test_apply",
        draft: expect.objectContaining({
          draftId: "draft_b2_rec_apply",
        }),
      }),
    );
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="success"]')).not.toBeNull();
    expect(detailRoot.textContent).toContain("已发送到 Meegle");
  });

  it("fails explicitly instead of fabricating a draft when pageType is unknown", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    const renderer = createLarkInjectionRenderer({
      pageContext: {
        pageType: "unknown",
        url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_unknown",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_unknown",
      },
    });

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Unknown record"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    await userClick(anchor.querySelector("button"));

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="error"]')).not.toBeNull();
    expect(detailRoot.textContent).toContain("发送到 Meegle 失败");
  });

  it("fails explicitly instead of fabricating apply success when record identity is missing", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    const draftPayload = {
      draftId: "draft_b2_missing_record",
      draftType: "b2" as const,
      sourceRef: {
        sourcePlatform: "lark_a1" as const,
        sourceRecordId: "rec_missing_source",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "bug",
        templateId: "production-bug",
      },
      name: "Burger 出库对接2",
      needConfirm: true as const,
      fieldValuePairs: [{ fieldKey: "priority", fieldValue: "P1" }],
      ownerUserKeys: [],
      missingMeta: [],
    };
    const requestDraft = vi.fn().mockResolvedValue(draftPayload);

    const renderer = createLarkInjectionRenderer({
      requestDraft,
      pageContext: {
        pageType: "lark_a1",
        url: "https://tenant/base/app_xxx/table/tbl_xxx",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        operatorLarkId: "ou_test_apply",
      },
    });

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Burger 出库对接2"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    await userClick(anchor.querySelector("button"));
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="draft-ready"]')).not.toBeNull();

    vi.mocked(chrome.runtime.sendMessage).mockClear();
    await userClick(detailRoot.querySelector('[data-tenways-octo-trigger="apply-to-meegle"]'));

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="error"]')).not.toBeNull();
    expect(detailRoot.textContent).toContain("发送到 Meegle 失败");
  });
});
