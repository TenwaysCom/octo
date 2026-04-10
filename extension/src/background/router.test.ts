import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LarkApplyMessage, LarkDraftMessage } from "../types/protocol";

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
}));

const { routeBackgroundAction } = await import("./router.js");
const runtimeMessageListener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];

describe("background router draft/apply bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards Lark Bug draft requests to the renamed Meegle Product Bug draft endpoint", async () => {
    const draftPayload = {
      draftId: "draft_b2_rec_001",
      draftType: "b2" as const,
      sourceRef: {
        sourcePlatform: "lark_a1" as const,
        sourceRecordId: "rec_001",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "bug",
        templateId: "production-bug",
      },
      name: "Burger 出库对接2",
      needConfirm: true as const,
      fieldValuePairs: [],
      ownerUserKeys: [],
      missingMeta: [],
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(draftPayload),
    } as unknown as Response);

    const message: LarkDraftMessage = {
      action: "itdog.a1.create_b2_draft",
      payload: {
        pageType: "lark_a1",
        url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_001",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_001",
        operatorLarkId: "ou_test",
        snapshot: {
          title: "Burger 出库对接2",
          fields: [],
        },
      },
    };

    const result = await routeBackgroundAction(message);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/lark-bug/to-meegle-product-bug/draft",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ recordId: "rec_001" }),
      }),
    );
    expect(result).toEqual({
      action: "itdog.a1.create_b2_draft",
      payload: draftPayload,
    });
  });

  it("forwards Lark User Story apply requests to the renamed Meegle User Story endpoint and includes masterUserId", async () => {
    const applyPayload = {
      status: "created" as const,
      workitemId: "B1-123",
      draft: {
        draftId: "draft_b1_rec_002",
        draftType: "b1" as const,
        sourceRef: {
          sourcePlatform: "lark_a2" as const,
          sourceRecordId: "rec_002",
        },
        target: {
          projectKey: "OPS",
          workitemTypeKey: "requirement",
          templateId: "requirement-default",
        },
        name: "需求整理",
        needConfirm: true as const,
        fieldValuePairs: [
          { fieldKey: "priority", fieldValue: "high" },
        ],
        ownerUserKeys: ["ou_owner"],
        missingMeta: [],
      },
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(applyPayload),
    } as unknown as Response);

    const message: LarkApplyMessage = {
      action: "itdog.a2.apply_b1",
      payload: {
        pageType: "lark_a2",
        url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_002",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_002",
        operatorLarkId: "ou_apply",
        masterUserId: "usr_resolved",
        snapshot: {
          title: "需求整理",
          fields: [],
        },
        draft: applyPayload.draft,
      },
    };

    const result = await routeBackgroundAction(message);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/lark-user-story/to-meegle-user-story/apply",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(fetchBody).toMatchObject({
      draftId: "draft_b1_rec_002",
      masterUserId: "usr_resolved",
      operatorLarkId: "ou_apply",
      sourceRecordId: "rec_002",
      confirmedDraft: {
        name: "需求整理",
        fieldValuePairs: [{ fieldKey: "priority", fieldValue: "high" }],
        ownerUserKeys: ["ou_owner"],
      },
    });
    expect(fetchBody.requestId).toEqual(expect.any(String));
    expect(fetchBody.idempotencyKey).toEqual(expect.any(String));
    expect(result).toEqual({
      action: "itdog.a2.apply_b1",
      payload: applyPayload,
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

    const message: LarkApplyMessage = {
      action: "itdog.a2.apply_b1",
      payload: {
        pageType: "lark_a2",
        url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_002",
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_002",
        operatorLarkId: "ou_apply",
        masterUserId: "usr_resolved",
        snapshot: {
          title: "需求整理",
          fields: [],
        },
        draft: {
          draftId: "draft_b1_rec_002",
          draftType: "b1",
          sourceRef: {
            sourcePlatform: "lark_a2",
            sourceRecordId: "rec_002",
          },
          target: {
            projectKey: "OPS",
            workitemTypeKey: "requirement",
            templateId: "requirement-default",
          },
          name: "需求整理",
          needConfirm: true,
          fieldValuePairs: [{ fieldKey: "priority", fieldValue: "high" }],
          ownerUserKeys: [],
          missingMeta: [],
        },
      },
    };

    await new Promise<void>((resolve) => {
      runtimeMessageListener?.(message, {} as never, (response: unknown) => {
        expect(response).toEqual({
          ok: false,
          error: {
            errorCode: "MEEGLE_AUTH_REQUIRED",
            errorMessage: "Need Meegle auth",
          },
        });
        resolve();
      });
    });
  });

  it("falls back to tab-scoped masterUserId when the page cannot provide operatorLarkId", async () => {
    const { getResolvedIdentityForTab } = await import("./storage.js");
    vi.mocked(getResolvedIdentityForTab).mockResolvedValueOnce("usr_tab_scoped");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        status: "created",
        workitemId: "B2-234",
        draft: {
          draftId: "draft_b2_rec_003",
          draftType: "b2",
          sourceRef: {
            sourcePlatform: "lark_a1",
            sourceRecordId: "rec_003",
          },
          target: {
            projectKey: "OPS",
            workitemTypeKey: "bug",
            templateId: "production-bug",
          },
          name: "支付页白屏",
          needConfirm: true,
          fieldValuePairs: [],
          ownerUserKeys: [],
          missingMeta: [],
        },
      }),
    } as unknown as Response);

    expect(runtimeMessageListener).toBeTypeOf("function");

    await new Promise<void>((resolve) => {
      runtimeMessageListener?.(
        {
          action: "itdog.a1.apply_b2",
          payload: {
            pageType: "lark_a1",
            url: "https://tenant/base/app_xxx/table/tbl_xxx/record/rec_003",
            baseId: "app_xxx",
            tableId: "tbl_xxx",
            recordId: "rec_003",
            snapshot: {
              title: "支付页白屏",
              fields: [],
            },
            draft: {
              draftId: "draft_b2_rec_003",
              draftType: "b2",
              sourceRef: {
                sourcePlatform: "lark_a1",
                sourceRecordId: "rec_003",
              },
              target: {
                projectKey: "OPS",
                workitemTypeKey: "bug",
                templateId: "production-bug",
              },
              name: "支付页白屏",
              needConfirm: true,
              fieldValuePairs: [],
              ownerUserKeys: [],
              missingMeta: [],
            },
          },
        } satisfies LarkApplyMessage,
        { tab: { id: 42 } } as never,
        (response: unknown) => {
          expect(response).toEqual({
            action: "itdog.a1.apply_b2",
            payload: expect.objectContaining({
              status: "created",
              workitemId: "B2-234",
            }),
          });
          resolve();
        },
      );
    });

    expect(getResolvedIdentityForTab).toHaveBeenCalledWith(42);
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(fetchBody).toMatchObject({
      draftId: "draft_b2_rec_003",
      masterUserId: "usr_tab_scoped",
      sourceRecordId: "rec_003",
      confirmedDraft: {
        name: "支付页白屏",
        fieldValuePairs: [],
        ownerUserKeys: [],
      },
    });
  });
});
