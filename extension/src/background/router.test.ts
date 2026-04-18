import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config.js", () => ({
  getConfig: vi.fn().mockResolvedValue({
    SERVER_URL: "http://localhost:3000",
    MEEGLE_PLUGIN_ID: "MEEGLE_PLUGIN_ID",
    LARK_APP_ID: "cli_test",
    LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
    MEEGLE_BASE_URL: "https://project.larksuite.com",
  }),
}));

vi.mock("./storage.js", () => ({
  getCachedUserToken: vi.fn().mockResolvedValue(undefined),
  saveAuthCodeResponse: vi.fn(),
  getCachedLarkUserToken: vi.fn().mockResolvedValue(undefined),
  clearPendingLarkOauthState: vi.fn(),
  saveLastLarkAuthResult: vi.fn(),
  savePendingLarkOauthState: vi.fn(),
  getResolvedIdentityForTab: vi.fn().mockResolvedValue(undefined),
  getStoredMasterUserId: vi.fn().mockResolvedValue(undefined),
}));

const { routeBackgroundAction } = await import("./router.js");
const runtimeMessageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];

describe("background router lark_base workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards lark_base.create_workitem to the server endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        ok: true,
        workitemId: "12345",
        meegleLink: "https://project.larksuite.com/OPS/story/detail/12345",
        recordId: "rec_base_001",
        workitems: [
          { workitemId: "12345", meegleLink: "https://project.larksuite.com/OPS/story/detail/12345" },
        ],
      }),
    } as unknown as Response);

    const result = await routeBackgroundAction({
      action: "itdog.lark_base.create_workitem",
      payload: {
        pageType: "lark_base",
        url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base_001",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_base_001",
        snapshot: {
          title: "Base record",
          fields: [],
          larkUrl: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base_001",
        },
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/lark-base/create-meegle-workitem",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(fetchBody).toMatchObject({
      recordId: "rec_base_001",
      baseId: "app_xxx",
      tableId: "tbl_xxx",
    });
    expect(result).toEqual({
      action: "itdog.lark_base.create_workitem",
      payload: {
        ok: true,
        workitemId: "12345",
        meegleLink: "https://project.larksuite.com/OPS/story/detail/12345",
        recordId: "rec_base_001",
        workitems: [
          { workitemId: "12345", meegleLink: "https://project.larksuite.com/OPS/story/detail/12345" },
        ],
      },
    });
  });

  it("preserves server business error codes instead of swallowing them as BACKGROUND_ERROR", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          errorCode: "MEEGLE_AUTH_REQUIRED",
          errorMessage: "Need Meegle auth",
        },
      }),
    } as unknown as Response);

    expect(runtimeMessageListener).toBeTypeOf("function");

    await new Promise<void>((resolve) => {
      runtimeMessageListener?.(
        {
          action: "itdog.lark_base.create_workitem",
          payload: {
            pageType: "lark_base",
            url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base_001",
            baseId: "app_xxx",
            tableId: "tbl_xxx",
            recordId: "rec_base_001",
            snapshot: {
              title: "Base record",
              fields: [],
              larkUrl: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base_001",
            },
          },
        },
        { tab: { id: 42 } } as never,
        (response: unknown) => {
          expect(response).toEqual({
            ok: false,
            error: {
              errorCode: "MEEGLE_AUTH_REQUIRED",
              errorMessage: "Need Meegle auth",
            },
          });
          resolve();
        },
      );
    });
  });

  it("falls back to tab-scoped masterUserId when payload masterUserId is missing", async () => {
    const { getResolvedIdentityForTab } = await import("./storage.js");
    vi.mocked(getResolvedIdentityForTab).mockResolvedValueOnce("usr_tab_scoped");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        ok: true,
        workitemId: "BASE-999",
        meegleLink: "https://project.larksuite.com/OPS/story/detail/BASE-999",
        recordId: "rec_base_002",
      }),
    } as unknown as Response);

    await routeBackgroundAction(
      {
        action: "itdog.lark_base.create_workitem",
        payload: {
          pageType: "lark_base",
          url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base_002",
          baseId: "app_xxx",
          tableId: "tbl_xxx",
          recordId: "rec_base_002",
          snapshot: {
            title: "Base record",
            fields: [],
            larkUrl: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base_002",
          },
        },
      },
      { senderTabId: 42 },
    );

    expect(getResolvedIdentityForTab).toHaveBeenCalledWith(42);
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(fetchBody).toMatchObject({
      recordId: "rec_base_002",
      masterUserId: "usr_tab_scoped",
    });
  });

  it("falls back to stored masterUserId when payload and tab identity are both missing", async () => {
    const { getStoredMasterUserId, getResolvedIdentityForTab } = await import("./storage.js");
    vi.mocked(getStoredMasterUserId).mockResolvedValueOnce("usr_stored_fallback");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        ok: true,
        workitemId: "12345",
        meegleLink: "https://project.larksuite.com/OPS/story/detail/12345",
        recordId: "rec_base_001",
        workitems: [
          { workitemId: "12345", meegleLink: "https://project.larksuite.com/OPS/story/detail/12345" },
        ],
      }),
    } as unknown as Response);

    expect(runtimeMessageListener).toBeTypeOf("function");

    await new Promise<void>((resolve) => {
      runtimeMessageListener?.(
        {
          action: "itdog.lark_base.create_workitem",
          payload: {
            pageType: "lark_base",
            url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base_001",
            baseId: "app_xxx",
            tableId: "tbl_xxx",
            recordId: "rec_base_001",
            snapshot: {
              title: "Base record",
              fields: [],
              larkUrl: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_base_001",
            },
          },
        },
        { tab: { id: 99 } } as never,
        (response: unknown) => {
          expect(response).toEqual({
            action: "itdog.lark_base.create_workitem",
            payload: {
              ok: true,
              workitemId: "12345",
              meegleLink: "https://project.larksuite.com/OPS/story/detail/12345",
              recordId: "rec_base_001",
              workitems: [
                { workitemId: "12345", meegleLink: "https://project.larksuite.com/OPS/story/detail/12345" },
              ],
            },
          });
          resolve();
        },
      );
    });

    expect(getResolvedIdentityForTab).toHaveBeenCalledWith(99);
    expect(getStoredMasterUserId).toHaveBeenCalled();
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(fetchBody).toMatchObject({
      recordId: "rec_base_001",
      masterUserId: "usr_stored_fallback",
      baseId: "app_xxx",
      tableId: "tbl_xxx",
    });
  });

  it("forwards lark_base.bulk_preview_workitems to the preview endpoint and reads viewId from the tab url", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        ok: true,
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        viewId: "vew_xxx",
        totalRecordsInView: 2,
        eligibleRecords: [],
        skippedRecords: [],
      }),
    } as unknown as Response);

    const result = await routeBackgroundAction(
      {
        action: "itdog.lark_base.bulk_preview_workitems",
        payload: {},
      },
      {
        senderTabId: 42,
        tabUrl: "https://tenant/base/app_xxx?table=tbl_xxx&view=vew_xxx",
      },
    );

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/lark-base/bulk-preview-meegle-workitems",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(fetchBody).toMatchObject({
      baseId: "app_xxx",
      tableId: "tbl_xxx",
      viewId: "vew_xxx",
    });
    expect(result).toEqual({
      action: "itdog.lark_base.bulk_preview_workitems",
      payload: {
        ok: true,
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        viewId: "vew_xxx",
        totalRecordsInView: 2,
        eligibleRecords: [],
        skippedRecords: [],
      },
    });
  });

  it("forwards lark_base.bulk_create_workitems to the create endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        ok: true,
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        viewId: "vew_xxx",
        totalRecordsInView: 2,
        summary: {
          created: 1,
          failed: 0,
          skipped: 1,
        },
        createdRecords: [],
        failedRecords: [],
        skippedRecords: [],
      }),
    } as unknown as Response);

    const result = await routeBackgroundAction(
      {
        action: "itdog.lark_base.bulk_create_workitems",
        payload: {
          baseId: "app_xxx",
          tableId: "tbl_xxx",
          viewId: "vew_xxx",
        },
      },
      { senderTabId: 42 },
    );

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/lark-base/bulk-create-meegle-workitems",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(fetchBody).toMatchObject({
      baseId: "app_xxx",
      tableId: "tbl_xxx",
      viewId: "vew_xxx",
    });
    expect(result).toEqual({
      action: "itdog.lark_base.bulk_create_workitems",
      payload: {
        ok: true,
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        viewId: "vew_xxx",
        totalRecordsInView: 2,
        summary: {
          created: 1,
          failed: 0,
          skipped: 1,
        },
        createdRecords: [],
        failedRecords: [],
        skippedRecords: [],
      },
    });
  });
});
