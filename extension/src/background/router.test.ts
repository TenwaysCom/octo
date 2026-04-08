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
}));

const { routeBackgroundAction } = await import("./router.js");

describe("background router draft/apply bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards A1 draft requests to the create-b2-draft server endpoint", async () => {
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
      "http://localhost:3000/api/a1/create-b2-draft",
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

  it("forwards A2 apply requests to the apply-b1 server endpoint", async () => {
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
        snapshot: {
          title: "需求整理",
          fields: [],
        },
        draft: applyPayload.draft,
      },
    };

    const result = await routeBackgroundAction(message);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/a2/apply-b1",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(fetchBody).toMatchObject({
      draftId: "draft_b1_rec_002",
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
});
