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
              <div class="field-row"><label>Request Status</label><div>Testing</div></div>
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

    document.body.innerHTML = `
      <div id="app">
        <main>
          <aside class="record-detail-panel">
            <div class="detail-header">
              <h2>Burger 出库对接2</h2>
            </div>
            <section class="field-list">
              <div class="field-row"><label>Request Status</label><div>Testing</div></div>
              <div class="field-row"><label>Priority</label><div>P0</div></div>
            </section>
          </aside>
        </main>
      </div>
    `;

    getTestingApi()?.refreshProbeState();

    expect(getTestingApi()?.getProbeState()).toEqual({
      detailState: "detail-ready",
      detailTitle: "Burger 出库对接2",
      anchorLabel: "detail-header",
    });

    const overlay = document.querySelector("[data-tenways-lark-probe-overlay]");
    expect(overlay?.textContent).toContain("detail: detail-ready");
    expect(overlay?.textContent).toContain("anchor: detail-header");
  });

  it("switches to detail-loading when a detail shell appears without parsed fields", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("WXT_PUBLIC_INJECTION_PROBE", "true");

    await import("./lark");

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

    expect(getTestingApi()?.getProbeState()).toEqual({
      detailState: "detail-loading",
      detailTitle: null,
      anchorLabel: null,
    });

    const overlay = document.querySelector("[data-tenways-lark-probe-overlay]");
    expect(overlay?.textContent).toContain("detail: detail-loading");
    expect(overlay?.textContent).toContain("title: -");
  });

  it("reports unknown pageType when no A1 or A2 signal is present", async () => {
    await import("./lark");

    window.history.replaceState({}, "", "/base/app_xxx/table/tbl_xxx/record/rec_unknown");

    expect(getTestingApi()?.detectLarkPageContext()).toMatchObject({
      pageType: "unknown",
      recordId: "rec_unknown",
    });
  });

  it("infers A2 from the parsed record fields", async () => {
    await import("./lark");

    document.body.innerHTML = `
      <div id="app">
        <main>
          <aside class="record-detail-panel">
            <div class="detail-header">
              <h2>需求整理</h2>
            </div>
            <section class="field-list">
              <div class="field-row"><label>Target</label><div>提升效率</div></div>
              <div class="field-row"><label>Acceptance</label><div>完成验收条件</div></div>
            </section>
          </aside>
        </main>
      </div>
    `;

    expect(getTestingApi()?.detectLarkPageContext()).toMatchObject({
      pageType: "lark_a2",
    });
  });
});
