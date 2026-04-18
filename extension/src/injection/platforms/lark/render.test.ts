// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createLarkInjectionRenderer, renderLarkInjection } from "./render";
import type { LarkRecordContext } from "./probe";

afterEach(() => {
  document.body.innerHTML = "";
});

function createContext(title: string, fields?: Array<{ label: string; value: string }>): LarkRecordContext {
  return {
    title,
    fields: fields ?? [
      { label: "Status", value: "Testing" },
      { label: "Priority", value: "P1" },
    ],
  };
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
  it("renders a dynamic Meegle User Story button for lark_base when issue type is User Story", () => {
    const anchor = document.createElement("div");

    renderLarkInjection({
      pageState: {
        kind: "detail-ready",
        context: createContext("Base需求", [
          { label: "Issue 类型", value: "User Story" },
          { label: "Priority", value: "P1" },
        ]),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
      deps: {
        pageContext: {
          pageType: "lark_base",
          url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base",
          baseId: "app_xxx",
          tableId: "tbl_xxx",
          recordId: "rec_base",
        },
      },
    });

    expect(anchor.textContent).toContain("创建 Meegle User Story");
  });

  it("renders a dynamic Meegle Tech Task button for lark_base when issue type is Tech Task", () => {
    const anchor = document.createElement("div");

    renderLarkInjection({
      pageState: {
        kind: "detail-ready",
        context: createContext("Base任务", [
          { label: "Issue Type", value: "Tech Task" },
          { label: "Priority", value: "P1" },
        ]),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
      deps: {
        pageContext: {
          pageType: "lark_base",
          url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base",
          baseId: "app_xxx",
          tableId: "tbl_xxx",
          recordId: "rec_base",
        },
      },
    });

    expect(anchor.textContent).toContain("创建 Meegle Tech Task");
  });

  it("renders a dynamic Meegle Production Bug button for lark_base when issue type is Production Bug", () => {
    const anchor = document.createElement("div");

    renderLarkInjection({
      pageState: {
        kind: "detail-ready",
        context: createContext("Base缺陷", [
          { label: "Issue 类型", value: "Production Bug" },
          { label: "Priority", value: "P0" },
        ]),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
      deps: {
        pageContext: {
          pageType: "lark_base",
          url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base",
          baseId: "app_xxx",
          tableId: "tbl_xxx",
          recordId: "rec_base",
        },
      },
    });

    expect(anchor.textContent).toContain("创建 Meegle Production Bug");
  });

  it("creates workitem in one step when button is clicked", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    const createWorkitem = vi.fn().mockResolvedValue({
      status: "created",
      workitemId: "BASE-123",
    });

    const renderer = createLarkInjectionRenderer({
      createWorkitem,
      pageContext: {
        pageType: "lark_base",
        url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_base",
        operatorLarkId: "ou_base",
        masterUserId: "usr_base",
      },
    });

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Base需求", [
          { label: "Issue 类型", value: "User Story" },
          { label: "Priority", value: "P1" },
        ]),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    await userClick(anchor.querySelector("button"));

    expect(createWorkitem).toHaveBeenCalledWith(
      expect.objectContaining({
        pageType: "lark_base",
        recordId: "rec_base",
        operatorLarkId: "ou_base",
        masterUserId: "usr_base",
        snapshot: expect.objectContaining({
          title: "Base需求",
        }),
      }),
    );
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="success"]')).not.toBeNull();
    expect(detailRoot.textContent).toContain("已创建 Meegle User Story");
  });

  it("disables the trigger while createWorkitem is still pending", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    const pendingCreate = createDeferred<{
      status: "created";
      workitemId: string;
    }>();
    const createWorkitem = vi.fn().mockReturnValue(pendingCreate.promise);

    const renderer = createLarkInjectionRenderer({
      createWorkitem,
      pageContext: {
        pageType: "lark_base",
        url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_base",
      },
    });

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Base需求"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    anchor.querySelector("button")?.click();
    await flushPromises();

    const trigger = anchor.querySelector("button") as HTMLButtonElement | null;
    expect(trigger?.disabled).toBe(true);
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="submitting"]')).not.toBeNull();

    pendingCreate.resolve({ status: "created", workitemId: "BASE-123" });
    await flushPromises();

    const nextTrigger = anchor.querySelector("button") as HTMLButtonElement | null;
    expect(nextTrigger?.disabled).toBe(false);
  });

  it("shows a specific auth message when createWorkitem returns MEEGLE_AUTH_REQUIRED", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    class LarkRuntimeRequestError extends Error {
      constructor(message: string, readonly errorCode?: string) {
        super(message);
        this.name = "LarkRuntimeRequestError";
      }
    }

    const createWorkitem = vi.fn().mockRejectedValue(
      new LarkRuntimeRequestError("Meegle 授权失效，请先在插件中重新授权后再试", "MEEGLE_AUTH_REQUIRED"),
    );

    const renderer = createLarkInjectionRenderer({
      createWorkitem,
      pageContext: {
        pageType: "lark_base",
        url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_base",
        operatorLarkId: "ou_base",
      },
    });

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Base需求"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    await userClick(anchor.querySelector("button"));

    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="error"]')).not.toBeNull();
    expect(detailRoot.textContent).toContain("Meegle 授权失效，请先在插件中重新授权后再试");
  });

  it("fails explicitly when recordId is missing", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    const renderer = createLarkInjectionRenderer({
      pageContext: {
        pageType: "lark_base",
        url: "https://tenant/base/app_xxx/table/tbl_xxx",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        operatorLarkId: "ou_base",
      },
    });

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Base需求"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    await userClick(anchor.querySelector("button"));

    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="error"]')).not.toBeNull();
    expect(detailRoot.textContent).toContain("recordId is required to create a workitem.");
  });
});

describe("createLarkInjectionRenderer", () => {
  it("resets stale state when the same anchor renders a different context", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    const createWorkitem = vi.fn().mockResolvedValue({
      status: "created",
      workitemId: "BASE-123",
    });

    const renderer = createLarkInjectionRenderer({
      createWorkitem,
      pageContext: {
        pageType: "lark_base",
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
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="success"]')).not.toBeNull();

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

  it("ignores late completion after context changes or collapse", async () => {
    const detailRoot = document.createElement("section");
    const anchor = document.createElement("div");
    detailRoot.appendChild(anchor);

    const firstCreate = createDeferred<{ status: "created"; workitemId: string }>();
    const secondCreate = createDeferred<{ status: "created"; workitemId: string }>();
    const createWorkitem = vi
      .fn()
      .mockReturnValueOnce(firstCreate.promise)
      .mockReturnValueOnce(secondCreate.promise);

    const renderer = createLarkInjectionRenderer({ createWorkitem });
    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("First record"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    anchor.querySelector("button")?.click();
    await flushPromises();
    expect(detailRoot.querySelector('[data-tenways-octo-panel-state="submitting"]')).not.toBeNull();

    renderer.render({
      pageState: {
        kind: "detail-ready",
        context: createContext("Second record"),
        anchor: { element: anchor, label: "detail-header", confidence: 1 },
      },
    });

    firstCreate.resolve({ status: "created", workitemId: "BASE-1" });
    await flushPromises();

    let panel = detailRoot.querySelector('[data-tenways-octo-mount="lark-detail-panel"]');
    expect(panel?.getAttribute("data-tenways-octo-panel-state")).toBe("collapsed");
    expect(panel?.textContent).not.toContain("BASE-1");

    anchor.querySelector("button")?.click();
    renderer.render({ pageState: { kind: "detail-closed" } });
    secondCreate.resolve({ status: "created", workitemId: "BASE-2" });
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
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}
