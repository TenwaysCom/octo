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
        viewId?: string;
        wikiRecordId?: string;
      } | null;
      refreshProbeState: () => void;
      getProbeState: () => {
        detailState: string;
        detailTitle: string | null;
        anchorLabel: string | null;
        recordId: string | null;
      };
      getLarkUserId: () => string | null;
      destroy: () => void;
    };
  }).__TENWAYS_LARK_TESTING__;
}

function createSupportedLarkPageConfig() {
  return {
    platform: "lark",
    pageType: "lark_record_create_meegle_item",
    matchedRuleId: "lark.record.create-meegle-item",
    sidebar: {
      injectPageElements: false,
      sidebarButtonEnabled: false,
      keyboardShortcutEnabled: false,
    },
    automationActions: [
      {
        key: "create-meegle-item",
        title: "批量创建 Meegle Item",
        interaction: { type: "direct_execute" },
        executor: {
          type: "frontend",
          actionKey: "create-meegle-item",
        },
        placements: [
          { surface: "popup" },
          { surface: "page_dom", target: "lark_detail_header" },
        ],
      },
    ],
  };
}

function mockPageConfig(pageConfig: ReturnType<typeof createSupportedLarkPageConfig>) {
  vi.doMock("./shared/page-config", () => ({
    fetchExtensionPageConfig: vi.fn().mockResolvedValue(pageConfig),
    pageConfigHasActionPlacement: vi.fn(
      (
        nextPageConfig: ReturnType<typeof createSupportedLarkPageConfig>,
        surface: string,
        target?: string,
      ) =>
        nextPageConfig.automationActions.some((action) =>
          action.placements?.some((placement) => {
            if (placement.surface !== surface) {
              return false;
            }

            if (target === undefined) {
              return true;
            }

            return "target" in placement && placement.target === target;
          }),
        ),
    ),
  }));
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function getLoggerApi() {
  return import("../logger.js");
}

describe("lark content script probe overlay", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("./shared/page-config");
    mockPageConfig(createSupportedLarkPageConfig());
    document.body.innerHTML = "";
  });

  afterEach(() => {
    getTestingApi()?.destroy?.();
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

  it("does not mount the real injection runtime when server page config disables page elements", async () => {
    mockPageConfig({
        platform: "lark",
        pageType: "lark",
        matchedRuleId: "lark.unmatched",
        sidebar: {
          injectPageElements: false,
          sidebarButtonEnabled: false,
          keyboardShortcutEnabled: false,
        },
        automationActions: [],
    });
    window.history.replaceState({}, "", "/app/cli_a962f20501a15ed3/baseinfo");
    document.body.innerHTML = `
      <div id="app">
        <main>
          <section class="record-detail-panel">
            <div class="detail-header">
              <h2>Credentials</h2>
            </div>
            <section class="field-list">
              <div class="field-row"><label>App ID</label><div>cli_a962f20501a15ed3</div></div>
              <div class="field-row"><label>App Secret</label><div>********************************</div></div>
            </section>
          </section>
        </main>
      </div>
    `;

    await import("./lark");
    await flushPromises();
    getTestingApi()?.refreshProbeState();

    expect(document.querySelector('[data-tenways-octo-trigger="send-to-meegle"]')).toBeNull();
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

    window.history.replaceState({}, "", "/base/app_xxx/table/tbl_xxx?recordId=rec_query&view=vew_query");

    expect(getTestingApi()?.detectLarkPageContext()).toMatchObject({
      baseId: "app_xxx",
      tableId: "tbl_xxx",
      recordId: "rec_query",
      viewId: "vew_query",
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

  it("reports lark_wiki_record pageType when on a Lark Wiki record URL", async () => {
    await import("./lark");

    window.history.replaceState({}, "", "/record/JfrhrMSAHeNRowcqTTclnyteg0c");

    // Simulate a wiki page DOM with a title
    document.body.innerHTML = `
      <div id="app">
        <main>
          <article class="wiki-content">
            <h1>Wiki Document Title</h1>
            <p>This is the content of the wiki page with some details.</p>
          </article>
        </main>
      </div>
    `;

    const context = getTestingApi()?.detectLarkPageContext();
    expect(context).toMatchObject({
      pageType: "lark_wiki_record",
      wikiRecordId: "JfrhrMSAHeNRowcqTTclnyteg0c",
    });
    expect(context?.recordId).toBeUndefined();
  });

  it("extracts a real recordId from the '记录ID' field on a Lark record URL", async () => {
    await import("./lark");

    window.history.replaceState({}, "", "/record/JfrhrMSAHeNRowcqTTclnyteg0c");

    document.body.innerHTML = `
      <div id="app">
        <main>
          <article class="wiki-content">
            <h1>Wiki Document Title</h1>
            <div class="field-row"><label>记录 ID</label><div>rec_from_wiki_page</div></div>
          </article>
        </main>
      </div>
    `;

    expect(getTestingApi()?.detectLarkPageContext()).toMatchObject({
      pageType: "lark_wiki_record",
      wikiRecordId: "JfrhrMSAHeNRowcqTTclnyteg0c",
      recordId: "rec_from_wiki_page",
    });
  });

  it("extracts a real recordId from page DOM on the shared Lark record entry URL", async () => {
    await import("./lark");

    window.history.replaceState({}, "", "/record/UeDireV0Ue4I4TcwTkXlV3ESghc");

    document.body.innerHTML = `
      <div id="app">
        <main>
          <article class="wiki-content">
            <h1>Production Bug</h1>
            <div class="field-row"><label>记录ID</label><div>rec_from_shared_record_page</div></div>
          </article>
        </main>
      </div>
    `;

    const context = getTestingApi()?.detectLarkPageContext();
    expect(context).toMatchObject({
      pageType: "lark_wiki_record",
      wikiRecordId: "UeDireV0Ue4I4TcwTkXlV3ESghc",
      recordId: "rec_from_shared_record_page",
    });
  });

  it("extracts a real recordId from page DOM on the shared Lark Base entry URL", async () => {
    await import("./lark");

    window.history.replaceState(
      {},
      "",
      "/base/XO0cbnxMIaralRsbBEolboEFgZc?table=tblUfu71xwdul3NH&view=vewMs17Tqk",
    );

    document.body.innerHTML = `
      <div id="app">
        <main>
          <aside class="record-detail-panel">
            <div class="detail-header">
              <h2>Production Bug</h2>
            </div>
            <section class="field-list">
              <div class="field-row"><label>记录ID</label><div>rec_from_shared_base_page</div></div>
            </section>
          </aside>
        </main>
      </div>
    `;

    const context = getTestingApi()?.detectLarkPageContext();
    expect(context).toMatchObject({
      pageType: "lark_base",
      baseId: "XO0cbnxMIaralRsbBEolboEFgZc",
      tableId: "tblUfu71xwdul3NH",
      viewId: "vewMs17Tqk",
      recordId: "rec_from_shared_base_page",
    });
  });

  it("reads lark user id from storage snapshots when the dom does not expose it", async () => {
    const loggerApi = await getLoggerApi();
    loggerApi.clearLogBuffer();
    loggerApi.setLogLevel("info");
    localStorage.setItem(
      "lark_user_profile",
      JSON.stringify({
        user_id: "ou_storage_test",
      }),
    );

    await import("./lark");

    expect(getTestingApi()?.getLarkUserId()).toBe("ou_storage_test");
    expect(loggerApi.getLogBuffer()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: "injection:lark-bootstrap",
          level: "debug",
          message: "larkIdentity.resolve",
          detail: expect.objectContaining({
            source: "storage",
            hasUserId: true,
          }),
        }),
      ]),
    );
  });
});
