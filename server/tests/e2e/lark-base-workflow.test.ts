import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeLarkBaseWorkflow } from "../../src/modules/lark-base/lark-base-workflow.service.js";
import type { LarkBitableRecord } from "../../src/adapters/lark/lark-client.js";

describe("lark-base workflow e2e", () => {
  beforeEach(() => {
    process.env.LARK_BASE_ISSUE_TYPE_MAPPINGS = JSON.stringify([
      { larkLabels: ["User Story"], workitemTypeKey: "story", templateId: "400329" },
      { larkLabels: ["Tech Task"], workitemTypeKey: "tech_task", templateId: "tpl_tech" },
      { larkLabels: ["Production Bug"], workitemTypeKey: "6932e40429d1cd8aac635c82", templateId: "645025" },
    ]);
  });

  const getLarkTokenStoreMock = vi.fn();
  const refreshLarkTokenMock = vi.fn();
  const createLarkClientMock = vi.fn();
  const executeMeegleApplyMock = vi.fn();
  const updateLarkBaseMeegleLinkMock = vi.fn();

  const deps = {
    getLarkTokenStore: () => ({
      get: getLarkTokenStoreMock,
      save: vi.fn(),
      delete: vi.fn(),
    }),
    refreshLarkToken: refreshLarkTokenMock,
    createLarkClient: createLarkClientMock,
    executeMeegleApply: executeMeegleApplyMock,
    updateLarkBaseMeegleLink: updateLarkBaseMeegleLinkMock,
  };

  function makeRecord(issueType: string | string[]): LarkBitableRecord {
    const issueTypes = Array.isArray(issueType) ? issueType : [issueType];
    return {
      record_id: "rec_e2e_001",
      fields: {
        "Issue 类型": issueTypes.map((text) => ({ text, id: `opt_${text}` })),
        "Issue Description": "[E2E] Test issue description",
        "Details Description": "[E2E] Detailed info",
      },
    };
  }

  it("creates a user story end-to-end for Issue 类型 = User Story", async () => {
    const record = makeRecord("User Story");
    createLarkClientMock.mockReturnValueOnce({
      getRecord: vi.fn().mockResolvedValueOnce(record),
    });
    getLarkTokenStoreMock.mockResolvedValueOnce({
      userToken: "token_e2e",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      baseUrl: "https://open.larksuite.com",
    });
    executeMeegleApplyMock.mockResolvedValueOnce({
      status: "created",
      workitemId: "wi_e2e_story",
      draft: {},
    });
    updateLarkBaseMeegleLinkMock.mockResolvedValueOnce({
      ok: true,
      recordId: "rec_e2e_001",
    });

    const result = await executeLarkBaseWorkflow(
      {
        recordId: "rec_e2e_001",
        masterUserId: "usr_e2e",
        baseId: "base_e2e",
        tableId: "tbl_e2e",
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      workitemId: "wi_e2e_story",
      meegleLink: expect.stringContaining("/issue/wi_e2e_story"),
      recordId: "rec_e2e_001",
      workitems: [
        { workitemId: "wi_e2e_story", meegleLink: expect.stringContaining("/issue/wi_e2e_story") },
      ],
    });

    expect(executeMeegleApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          draftId: "draft_base_rec_e2e_001_story_0",
          sourceRef: {
            sourcePlatform: "lark_base",
            sourceRecordId: "rec_e2e_001",
          },
          target: expect.objectContaining({
            workitemTypeKey: "story",
            templateId: "400329",
          }),
        }),
      }),
      {},
    );
  });

  it("creates a production bug end-to-end for Issue 类型 = Production Bug", async () => {
    const record = makeRecord("Production Bug");
    createLarkClientMock.mockReturnValueOnce({
      getRecord: vi.fn().mockResolvedValueOnce(record),
    });
    getLarkTokenStoreMock.mockResolvedValueOnce({
      userToken: "token_e2e",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      baseUrl: "https://open.larksuite.com",
    });
    executeMeegleApplyMock.mockResolvedValueOnce({
      status: "created",
      workitemId: "wi_e2e_bug",
      draft: {},
    });
    updateLarkBaseMeegleLinkMock.mockResolvedValueOnce({
      ok: true,
      recordId: "rec_e2e_001",
    });

    const result = await executeLarkBaseWorkflow(
      {
        recordId: "rec_e2e_001",
        masterUserId: "usr_e2e",
        baseId: "base_e2e",
        tableId: "tbl_e2e",
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      workitemId: "wi_e2e_bug",
      meegleLink: expect.stringContaining("/issue/wi_e2e_bug"),
      recordId: "rec_e2e_001",
      workitems: [
        { workitemId: "wi_e2e_bug", meegleLink: expect.stringContaining("/issue/wi_e2e_bug") },
      ],
    });

    expect(executeMeegleApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          draftId: "draft_base_rec_e2e_001_6932e40429d1cd8aac635c82_0",
          target: expect.objectContaining({
            workitemTypeKey: "6932e40429d1cd8aac635c82",
            templateId: "645025",
          }),
        }),
      }),
      {},
    );
  });
});
