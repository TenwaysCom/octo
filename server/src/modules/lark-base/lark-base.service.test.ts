import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLarkRecordUrl, updateLarkBaseMeegleLink } from "./lark-base.service.js";

describe("lark-base.service", () => {
  const getMock = vi.fn();
  const saveMock = vi.fn();
  const createLarkClientMock = vi.fn();

  const deps = {
    getLarkTokenStore: () => ({
      get: getMock,
      save: saveMock,
      delete: vi.fn(),
    }),
    createLarkClient: createLarkClientMock,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets the shared Lark record URL successfully", async () => {
    const batchGetRecordsMock = vi.fn().mockResolvedValueOnce({
      records: [
        {
          record_id: "rec_123",
          fields: {},
          shared_url: "https://base.larksuite.com/base/base_123/table/tbl_456/record/rec_123",
        },
      ],
      forbidden_record_ids: [],
      absent_record_ids: [],
    });
    getMock.mockResolvedValueOnce({
      masterUserId: "usr_123",
      tenantKey: "tenant_xxx",
      larkUserId: "lark_123",
      baseUrl: "https://open.larksuite.com",
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      credentialStatus: "active",
    });
    createLarkClientMock.mockReturnValueOnce({
      batchGetRecords: batchGetRecordsMock,
    });

    const result = await getLarkRecordUrl(
      {
        baseId: "base_123",
        tableId: "tbl_456",
        recordId: "rec_123",
        masterUserId: "usr_123",
      },
      deps,
    );

    expect(batchGetRecordsMock).toHaveBeenCalledWith(
      "base_123",
      "tbl_456",
      ["rec_123"],
      { withSharedUrl: true },
    );
    expect(result).toEqual({
      ok: true,
      recordId: "rec_123",
      recordUrl: "https://base.larksuite.com/base/base_123/table/tbl_456/record/rec_123",
    });
  });

  it("throws when the shared Lark record URL is missing", async () => {
    const batchGetRecordsMock = vi.fn().mockResolvedValueOnce({
      records: [
        {
          record_id: "rec_123",
          fields: {},
        },
      ],
      forbidden_record_ids: [],
      absent_record_ids: [],
    });
    getMock.mockResolvedValueOnce({
      masterUserId: "usr_123",
      tenantKey: "tenant_xxx",
      larkUserId: "lark_123",
      baseUrl: "https://open.larksuite.com",
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      credentialStatus: "active",
    });
    createLarkClientMock.mockReturnValueOnce({
      batchGetRecords: batchGetRecordsMock,
    });

    await expect(
      getLarkRecordUrl(
        {
          baseId: "base_123",
          tableId: "tbl_456",
          recordId: "rec_123",
          masterUserId: "usr_123",
        },
        deps,
      ),
    ).rejects.toThrow("Lark record shared URL not found");
  });

  it("updates the meegle link field successfully", async () => {
    const updateRecordMock = vi.fn().mockResolvedValueOnce({
      record_id: "rec_123",
      fields: {},
    });
    getMock.mockResolvedValueOnce({
      masterUserId: "usr_123",
      tenantKey: "tenant_xxx",
      larkUserId: "lark_123",
      baseUrl: "https://open.larksuite.com",
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      credentialStatus: "active",
    });
    createLarkClientMock.mockReturnValueOnce({
      updateRecord: updateRecordMock,
    });

    const result = await updateLarkBaseMeegleLink(
      {
        baseId: "app_xxx",
        tableId: "tbl_xxx",
        recordId: "rec_123",
        meegleLink: "https://project.larksuite.com/story/123",
        masterUserId: "usr_123",
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      recordId: "rec_123",
    });
    expect(updateRecordMock).toHaveBeenCalledWith(
      "app_xxx",
      "tbl_xxx",
      "rec_123",
      {
        meegle链接: {
          text: "https://project.larksuite.com/story/123",
          link: "https://project.larksuite.com/story/123",
        },
      },
    );
  });
});
