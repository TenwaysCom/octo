// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function getTestingApi() {
  return (globalThis as typeof globalThis & {
    __TENWAYS_LARK_TESTING__?: {
      detectLarkPageContext: () => {
        pageType: string;
        url: string;
        baseId?: string;
        tableId?: string;
        recordId?: string;
      } | null;
      refreshProbeState: () => void;
      getProbeState: () => {
        detailState: string;
        detailTitle: string | null;
        anchorLabel: string | null;
        recordId: string | null;
      };
    };
  }).__TENWAYS_LARK_TESTING__;
}

describe("lark content script probe overlay", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not render the overlay unless dev probe mode is enabled", async () => {
    await import("./lark");

    expect(document.querySelector("[data-tenways-lark-probe-overlay]")).toBeNull();
  });

  it("mounts the real injection runtime even when probe mode is disabled", async () => {
    await import("./lark");

    document.body.innerHTML = `
      <div id="app">
        <main>
          <aside class="record-detail-panel">
            <div class="detail-header">
              <h2>Burger 出库对接2</h2>
            </div>
            <section class="field-list">
              <div class="field-row"><label>Issue 类型</label><div>User Story</div></div>
              <div class="field-row"><label>Priority</label><div>P0</div></div>
              <div data-user-id="ou_runtime_test"></div>
            </section>
          </aside>
        </main>
      </div>
    `;

    getTestingApi()?.refreshProbeState();

    expect(document.querySelector('[data-tenways-octo-trigger="send-to-meegle"]')).not.toBeNull();
    expect(document.querySelector("[data-tenways-lark-probe-overlay]")).toBeNull();
  });

  it("renders the overlay when dev probe mode is enabled", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("WXT_PUBLIC_INJECTION_PROBE", "true");

    await import("./lark");

    const overlay = document.querySelector("[data-tenways-lark-probe-overlay]");

    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain("detail: closed");
  });

  it("switches to detail-ready when a detail-like panel appears", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("WXT_PUBLIC_INJECTION_PROBE", "true");

    await import("./lark");
    window.history.replaceState({}, "", "/base/app_xxx/table/tbl_xxx/record/rec_probe_ready");

    document.body.innerHTML = `
      <div id="app">
        <main>
          <aside class="record-detail-panel">
            <div class="detail-header">
              <h2>Burger 出库对接2</h2>
            </div>
            <section class="field-list">
              <div class="field-row"><label>Issue 类型</label><div>User Story</div></div>
              <div class="field-row"><label>Priority</label><div>P0</div></div>
            </section>
          </aside>
        </main>
      </div>
    `;

    getTestingApi()?.refreshProbeState();

    expect(getTestingApi()?.getProbeState()).toMatchObject({
      detailState: "detail-ready",
      detailTitle: "Burger 出库对接2",
      anchorLabel: "detail-header",
      recordId: "rec_probe_ready",
    });

    const overlay = document.querySelector("[data-tenways-lark-probe-overlay]");
    expect(overlay?.textContent).toContain("detail: detail-ready");
    expect(overlay?.textContent).toContain("anchor: detail-header");
    expect(overlay?.textContent).toContain("recordId: rec_probe_ready");
  });

  it("switches to detail-loading when a detail shell appears without parsed fields", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("WXT_PUBLIC_INJECTION_PROBE", "true");

    await import("./lark");
    window.history.replaceState({}, "", "/base/app_xxx/table/tbl_xxx?recordId=rec_probe_loading");

    document.body.innerHTML = `
      <div id="app">
        <main>
          <aside class="record-detail-panel">
            <div class="detail-header">
              <h2>Loading panel</h2>
            </div>
          </aside>
        </main>
      </div>
    `;

    getTestingApi()?.refreshProbeState();

    expect(getTestingApi()?.getProbeState()).toMatchObject({
      detailState: "detail-loading",
      detailTitle: null,
      anchorLabel: null,
      recordId: "rec_probe_loading",
    });

    const overlay = document.querySelector("[data-tenways-lark-probe-overlay]");
    expect(overlay?.textContent).toContain("detail: detail-loading");
    expect(overlay?.textContent).toContain("title: -");
    expect(overlay?.textContent).toContain("recordId: rec_probe_loading");
  });

  it("reports lark_base pageType when on a Lark Base URL", async () => {
    await import("./lark");

    window.history.replaceState({}, "", "/base/app_xxx/table/tbl_xxx/record/rec_base");

    expect(getTestingApi()?.detectLarkPageContext()).toMatchObject({
      pageType: "lark_base",
      recordId: "rec_base",
    });
  });

  it("extracts recordId from query params when the detail panel opens without a /record path segment", async () => {
    await import("./lark");

    window.history.replaceState({}, "", "/base/app_xxx/table/tbl_xxx?recordId=rec_query");

    expect(getTestingApi()?.detectLarkPageContext()).toMatchObject({
      baseId: "app_xxx",
      tableId: "tbl_xxx",
      recordId: "rec_query",
    });
  });

  it("extracts recordId from '记录ID' field when URL does not contain it", async () => {
    await import("./lark");

    window.history.replaceState({}, "", "/base/app_xxx/table/tbl_xxx");

    document.body.innerHTML = `
      <div id="app">
        <main>
          <aside class="record-detail-panel">
            <div class="detail-header">
              <h2>测试需求</h2>
            </div>
            <section class="field-list">
              <div class="field-row"><label>记录 ID</label><div>rec_from_field</div></div>
              <div class="field-row"><label>Priority</label><div>P0</div></div>
            </section>
          </aside>
        </main>
      </div>
    `;

    expect(getTestingApi()?.detectLarkPageContext()).toMatchObject({
      baseId: "app_xxx",
      tableId: "tbl_xxx",
      recordId: "rec_from_field",
    });
  });

  it("extracts recordId from '记录ID' field even when only one field is present", async () => {
    await import("./lark");

    window.history.replaceState({}, "", "/base/app_xxx/table/tbl_xxx");

    document.body.innerHTML = `
      <div id="app">
        <main>
          <aside class="record-detail-panel">
            <div class="detail-header">
              <h2>单一字段测试</h2>
            </div>
            <section class="field-list">
              <div class="field-row"><label>记录 ID</label><div>rec_single_field</div></div>
            </section>
          </aside>
        </main>
      </div>
    `;

    expect(getTestingApi()?.detectLarkPageContext()).toMatchObject({
      baseId: "app_xxx",
      tableId: "tbl_xxx",
      recordId: "rec_single_field",
    });
  });
});
