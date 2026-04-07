// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function getTestingApi() {
  return (globalThis as typeof globalThis & {
    __TENWAYS_LARK_TESTING__?: {
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
});
