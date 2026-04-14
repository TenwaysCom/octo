import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeLarkBaseWorkflow } from "./lark-base-workflow.service.js";
import type { LarkBitableRecord } from "../../adapters/lark/lark-client.js";

describe("lark-base-workflow.service", () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRecord(issueType: string | string[]): LarkBitableRecord {
    const issueTypes = Array.isArray(issueType) ? issueType : [issueType];
    return {
      record_id: "rec_123",
      fields: {
        "Issue 类型": issueTypes.map((text) => ({ text, id: `opt_${text}` })),
        "Issue Description": "Test issue description",
        "Details Description": "Detailed info",
      },
    };
  }

  it("returns INVALID_REQUEST when baseId and tableId are missing and env defaults are empty", async () => {
    const originalBaseId = process.env.LARK_BASE_DEFAULT_BASE_ID;
    const originalTableId = process.env.LARK_BASE_DEFAULT_TABLE_ID;
    process.env.LARK_BASE_DEFAULT_BASE_ID = "";
    process.env.LARK_BASE_DEFAULT_TABLE_ID = "";

    const result = await executeLarkBaseWorkflow(
      { recordId: "rec_123", masterUserId: "usr_xxx" },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        errorCode: "INVALID_REQUEST",
        errorMessage: expect.stringContaining("baseId and tableId are required"),
      },
    });

    process.env.LARK_BASE_DEFAULT_BASE_ID = originalBaseId;
    process.env.LARK_BASE_DEFAULT_TABLE_ID = originalTableId;
  });

  it("creates a user story for Issue 类型 = User Story", async () => {
    const record = makeRecord("User Story");
    createLarkClientMock.mockReturnValueOnce({
      getRecord: vi.fn().mockResolvedValueOnce(record),
    });
    getLarkTokenStoreMock.mockResolvedValueOnce({
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      baseUrl: "https://open.larksuite.com",
    });
    executeMeegleApplyMock.mockResolvedValueOnce({
      status: "created",
      workitemId: "wi_111",
      draft: {},
    });
    updateLarkBaseMeegleLinkMock.mockResolvedValueOnce({
      ok: true,
      recordId: "rec_123",
    });

    const result = await executeLarkBaseWorkflow(
      {
        recordId: "rec_123",
        masterUserId: "usr_xxx",
        baseId: "base_123",
        tableId: "tbl_456",
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      workitemId: "wi_111",
      meegleLink: expect.stringContaining("/issue/wi_111"),
      recordId: "rec_123",
    });

    expect(executeMeegleApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          draftType: "b1",
          target: expect.objectContaining({
            workitemTypeKey: "story",
            templateId: "400329",
          }),
        }),
      }),
      {},
    );
  });

  it("creates a production bug for Issue 类型 = Production Bug", async () => {
    const record = makeRecord("Production Bug");
    createLarkClientMock.mockReturnValueOnce({
      getRecord: vi.fn().mockResolvedValueOnce(record),
    });
    getLarkTokenStoreMock.mockResolvedValueOnce({
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      baseUrl: "https://open.larksuite.com",
    });
    executeMeegleApplyMock.mockResolvedValueOnce({
      status: "created",
      workitemId: "wi_222",
      draft: {},
    });
    updateLarkBaseMeegleLinkMock.mockResolvedValueOnce({
      ok: true,
      recordId: "rec_123",
    });

    const result = await executeLarkBaseWorkflow(
      {
        recordId: "rec_123",
        masterUserId: "usr_xxx",
        baseId: "base_123",
        tableId: "tbl_456",
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      workitemId: "wi_222",
      meegleLink: expect.stringContaining("/issue/wi_222"),
      recordId: "rec_123",
    });

    expect(executeMeegleApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          draftType: "b2",
          target: expect.objectContaining({
            workitemTypeKey: "6932e40429d1cd8aac635c82",
            templateId: "645025",
          }),
        }),
      }),
      {},
    );
  });

  it("refreshes the Lark token when expired", async () => {
    const record = makeRecord("User Story");
    createLarkClientMock.mockReturnValueOnce({
      getRecord: vi.fn().mockResolvedValueOnce(record),
    });
    getLarkTokenStoreMock.mockResolvedValueOnce({
      userToken: "old_token",
      userTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
      refreshToken: "refresh_123",
      baseUrl: "https://open.larksuite.com",
    });
    refreshLarkTokenMock.mockResolvedValueOnce({
      accessToken: "new_token",
    });
    executeMeegleApplyMock.mockResolvedValueOnce({
      status: "created",
      workitemId: "wi_333",
      draft: {},
    });
    updateLarkBaseMeegleLinkMock.mockResolvedValueOnce({
      ok: true,
      recordId: "rec_123",
    });

    await executeLarkBaseWorkflow(
      {
        recordId: "rec_123",
        masterUserId: "usr_xxx",
        baseId: "base_123",
        tableId: "tbl_456",
      },
      deps,
    );

    expect(refreshLarkTokenMock).toHaveBeenCalledWith({
      masterUserId: "usr_xxx",
      baseUrl: "https://open.larksuite.com",
      refreshToken: "refresh_123",
    });
    expect(createLarkClientMock).toHaveBeenCalledWith(
      "new_token",
      "https://open.larksuite.com",
    );
  });

  it("returns LARK_API_ERROR when getRecord fails", async () => {
    getLarkTokenStoreMock.mockResolvedValueOnce({
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      baseUrl: "https://open.larksuite.com",
    });
    createLarkClientMock.mockReturnValueOnce({
      getRecord: vi.fn().mockRejectedValueOnce(new Error("Record not found")),
    });

    const result = await executeLarkBaseWorkflow(
      {
        recordId: "rec_123",
        masterUserId: "usr_xxx",
        baseId: "base_123",
        tableId: "tbl_456",
      },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        errorCode: "LARK_API_ERROR",
        errorMessage: "Record not found",
      },
    });
  });

  it("returns UNKNOWN_ISSUE_TYPE when Issue 类型 is not recognized", async () => {
    const record = makeRecord("Unknown Type");
    createLarkClientMock.mockReturnValueOnce({
      getRecord: vi.fn().mockResolvedValueOnce(record),
    });
    getLarkTokenStoreMock.mockResolvedValueOnce({
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      baseUrl: "https://open.larksuite.com",
    });

    const result = await executeLarkBaseWorkflow(
      {
        recordId: "rec_123",
        masterUserId: "usr_xxx",
        baseId: "base_123",
        tableId: "tbl_456",
      },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        errorCode: "UNKNOWN_ISSUE_TYPE",
        errorMessage: expect.stringContaining("Unknown or unsupported Issue 类型"),
      },
    });
  });

  it("returns UPDATE_FAILED when Meegle apply fails", async () => {
    const record = makeRecord("User Story");
    createLarkClientMock.mockReturnValueOnce({
      getRecord: vi.fn().mockResolvedValueOnce(record),
    });
    getLarkTokenStoreMock.mockResolvedValueOnce({
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      baseUrl: "https://open.larksuite.com",
    });
    const meegleError = new Error("Meegle binding required");
    (meegleError as Error & { errorCode: string }).errorCode = "MEEGLE_BINDING_REQUIRED";
    executeMeegleApplyMock.mockRejectedValueOnce(meegleError);

    const result = await executeLarkBaseWorkflow(
      {
        recordId: "rec_123",
        masterUserId: "usr_xxx",
        baseId: "base_123",
        tableId: "tbl_456",
      },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        errorCode: "MEEGLE_BINDING_REQUIRED",
        errorMessage: "Meegle binding required",
      },
    });
  });

  it("returns UPDATE_FAILED when writing back to Lark fails", async () => {
    const record = makeRecord("User Story");
    createLarkClientMock.mockReturnValueOnce({
      getRecord: vi.fn().mockResolvedValueOnce(record),
    });
    getLarkTokenStoreMock.mockResolvedValueOnce({
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      baseUrl: "https://open.larksuite.com",
    });
    executeMeegleApplyMock.mockResolvedValueOnce({
      status: "created",
      workitemId: "wi_444",
      draft: {},
    });
    updateLarkBaseMeegleLinkMock.mockRejectedValueOnce(
      new Error("Lark token not found for user"),
    );

    const result = await executeLarkBaseWorkflow(
      {
        recordId: "rec_123",
        masterUserId: "usr_xxx",
        baseId: "base_123",
        tableId: "tbl_456",
      },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        errorCode: "UPDATE_FAILED",
        errorMessage: "Lark token not found for user",
      },
    });
  });
});
