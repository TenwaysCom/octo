import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeLarkBaseBulkWorkflow,
  previewLarkBaseBulkWorkflow,
} from "./lark-base-bulk-workflow.service.js";
import type { LarkBitableRecord } from "../../adapters/lark/lark-client.js";

describe("lark-base-bulk-workflow.service", () => {
  const getLarkTokenStoreMock = vi.fn();
  const refreshLarkTokenMock = vi.fn();
  const createLarkClientMock = vi.fn();
  const executeLarkBaseWorkflowMock = vi.fn();

  const deps = {
    getLarkTokenStore: () => ({
      get: getLarkTokenStoreMock,
      save: vi.fn(),
      delete: vi.fn(),
    }),
    refreshLarkToken: refreshLarkTokenMock,
    createLarkClient: createLarkClientMock,
    executeLarkBaseWorkflow: executeLarkBaseWorkflowMock,
  };

  function makeRecord(
    recordId: string,
    fields: Record<string, unknown>,
  ): LarkBitableRecord {
    return {
      record_id: recordId,
      fields,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getLarkTokenStoreMock.mockResolvedValue({
      masterUserId: "usr_xxx",
      tenantKey: "tenant_xxx",
      larkUserId: "ou_xxx",
      baseUrl: "https://open.larksuite.com",
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      credentialStatus: "active",
    });
  });

  it("builds preview rows with record id, title, and priority for eligible records", async () => {
    createLarkClientMock.mockReturnValueOnce({
      listRecordsByView: vi.fn().mockResolvedValueOnce({
        records: [
          makeRecord("rec_eligible", {
            "Issue Description": "Need sync",
            Priority: "P0",
            meegle链接: "",
          }),
          makeRecord("rec_existing", {
            "Issue Description": "Already synced",
            Priority: "P1",
            meegle链接: "https://project.larksuite.com/ABC/story/detail/1",
          }),
        ],
        hasMore: false,
      }),
    });

    const result = await previewLarkBaseBulkWorkflow(
      {
        baseId: "base_123",
        tableId: "tbl_456",
        viewId: "vew_789",
        masterUserId: "usr_xxx",
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      baseId: "base_123",
      tableId: "tbl_456",
      viewId: "vew_789",
      totalRecordsInView: 2,
      eligibleRecords: [
        {
          recordId: "rec_eligible",
          title: "Need sync",
          priority: "P0",
        },
      ],
      skippedRecords: [
        {
          recordId: "rec_existing",
          title: "Already synced",
          priority: "P1",
          reason: "ALREADY_LINKED",
        },
      ],
    });
  });

  it("skips records with existing meegle链接 and creates workitems for the rest", async () => {
    createLarkClientMock.mockReturnValueOnce({
      listRecordsByView: vi
        .fn()
        .mockResolvedValueOnce({
          records: [
            makeRecord("rec_create", {
              "Issue Description": "Create me",
              Priority: "P0",
              meegle链接: "",
            }),
            makeRecord("rec_skip", {
              "Issue Description": "Skip me",
              Priority: "P1",
              meegle链接: "https://project.larksuite.com/ABC/story/detail/2",
            }),
          ],
          hasMore: false,
        }),
    });
    executeLarkBaseWorkflowMock.mockResolvedValueOnce({
      ok: true,
      workitemId: "WI-1",
      meegleLink: "https://project.larksuite.com/ABC/story/detail/WI-1",
      recordId: "rec_create",
      workitems: [
        {
          workitemId: "WI-1",
          meegleLink: "https://project.larksuite.com/ABC/story/detail/WI-1",
        },
      ],
    });

    const result = await executeLarkBaseBulkWorkflow(
      {
        baseId: "base_123",
        tableId: "tbl_456",
        viewId: "vew_789",
        masterUserId: "usr_xxx",
      },
      deps,
    );

    expect(executeLarkBaseWorkflowMock).toHaveBeenCalledTimes(1);
    expect(executeLarkBaseWorkflowMock).toHaveBeenCalledWith(
      {
        baseId: "base_123",
        tableId: "tbl_456",
        recordId: "rec_create",
        masterUserId: "usr_xxx",
      },
      deps,
    );
    expect(result).toEqual({
      ok: true,
      baseId: "base_123",
      tableId: "tbl_456",
      viewId: "vew_789",
      totalRecordsInView: 2,
      summary: {
        created: 1,
        failed: 0,
        skipped: 1,
      },
      createdRecords: [
        {
          recordId: "rec_create",
          title: "Create me",
          priority: "P0",
          workitemId: "WI-1",
          meegleLink: "https://project.larksuite.com/ABC/story/detail/WI-1",
        },
      ],
      failedRecords: [],
      skippedRecords: [
        {
          recordId: "rec_skip",
          title: "Skip me",
          priority: "P1",
          reason: "ALREADY_LINKED",
        },
      ],
    });
  });
});
