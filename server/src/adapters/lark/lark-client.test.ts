import { beforeEach, describe, expect, it, vi } from "vitest";
import { LarkBatchCreateError, LarkClient } from "./lark-client.js";

describe("lark-client", () => {
  const requestMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("batchGetRecords calls the batch_get endpoint and returns record buckets", async () => {
    const client = new LarkClient({
      accessToken: "token_123",
      baseUrl: "https://open.larksuite.com",
    });
    (
      client as unknown as {
        client: { request: typeof requestMock };
      }
    ).client = {
      request: requestMock,
    };

    requestMock.mockResolvedValueOnce({
      code: 0,
      data: {
        records: [
          {
            record_id: "rec_1",
            fields: { Title: "One" },
            shared_url: "https://base.larksuite.com/rec_1",
            created_time: "2026-04-16T10:00:00.000Z",
            last_modified_time: 1776333900000,
          },
        ],
        forbidden_record_ids: ["rec_forbidden"],
        absent_record_ids: ["rec_missing"],
      },
    });

    const result = await client.batchGetRecords(
      "base_123",
      "tbl_456",
      ["rec_1", "rec_forbidden", "rec_missing"],
      { withSharedUrl: true },
    );

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "/open-apis/bitable/v1/apps/base_123/tables/tbl_456/records/batch_get",
        data: {
          record_ids: ["rec_1", "rec_forbidden", "rec_missing"],
          with_shared_url: true,
        },
      }),
      expect.anything(),
    );
    expect(result).toEqual({
      records: [
        {
          record_id: "rec_1",
          fields: { Title: "One" },
          shared_url: "https://base.larksuite.com/rec_1",
          created_time: "2026-04-16T10:00:00.000Z",
          updated_time: "2026-04-16T10:05:00.000Z",
        },
      ],
      forbidden_record_ids: ["rec_forbidden"],
      absent_record_ids: ["rec_missing"],
    });
  });

  it("listRecordsByView calls the bitable/v1 records endpoint with view_id", async () => {
    const client = new LarkClient({
      accessToken: "token_123",
      baseUrl: "https://open.larksuite.com",
    });
    (
      client as unknown as {
        client: { request: typeof requestMock };
      }
    ).client = {
      request: requestMock,
    };

    requestMock.mockResolvedValueOnce({
      code: 0,
      data: {
        items: [
          {
            record_id: "rec_view_1",
            fields: { Title: "Visible in view" },
            created_time: "2026-04-18T10:00:00Z",
            updated_time: "2026-04-18T10:05:00Z",
          },
        ],
        has_more: true,
        page_token: "next_page_token",
      },
    });

    const result = await client.listRecordsByView(
      "base_123",
      "tbl_456",
      "vew_789",
      {
        pageSize: 100,
        pageToken: "current_page_token",
      },
    );

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "/open-apis/bitable/v1/apps/base_123/tables/tbl_456/records",
        params: {
          view_id: "vew_789",
          page_size: 100,
          page_token: "current_page_token",
        },
      }),
      expect.anything(),
    );
    expect(result).toEqual({
      records: [
        {
          record_id: "rec_view_1",
          fields: { Title: "Visible in view" },
          created_time: "2026-04-18T10:00:00.000Z",
          updated_time: "2026-04-18T10:05:00.000Z",
          shared_url: undefined,
        },
      ],
      hasMore: true,
      nextPageToken: "next_page_token",
    });
  });

  it("listRecords forwards the source-side incremental filter and automatic fields", async () => {
    const client = new LarkClient({
      accessToken: "token_123",
      baseUrl: "https://open.larksuite.com",
    });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock.mockResolvedValueOnce({
      code: 0,
      data: { items: [], has_more: false },
    });

    await client.listRecords("base_123", "tbl_456", {
      pageSize: 100,
      pageToken: "page_2",
      filter: 'CurrentValue.[最后更新时间] >= TODATE("2026-08-11T00:00:00.000Z")',
      automaticFields: true,
    });

    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: "/open-apis/bitable/v1/apps/base_123/tables/tbl_456/records",
      params: {
        page_size: 100,
        page_num: 1,
        page_token: "page_2",
        filter: 'CurrentValue.[最后更新时间] >= TODATE("2026-08-11T00:00:00.000Z")',
        sort: undefined,
        automatic_fields: true,
      },
    }), expect.anything());
  });

  it("batchCreateRecords creates records in the bitable batch endpoint", async () => {
    const client = new LarkClient({ accessToken: "token_123", baseUrl: "https://open.larksuite.com" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock.mockResolvedValueOnce({
      code: 0,
      data: { records: [{ record_id: "rec_1", fields: { 描述: "反馈" } }] },
    });

    await expect(client.batchCreateRecords("base_123", "tbl_456", [{ 描述: "反馈" }])).resolves.toEqual([
      { record_id: "rec_1", fields: { 描述: "反馈" }, shared_url: undefined },
    ]);
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      url: "/open-apis/bitable/v1/apps/base_123/tables/tbl_456/records/batch_create",
      data: { records: [{ fields: { 描述: "反馈" } }] },
    }), expect.anything());
  });

  it("getFields returns field ids and names for schema validation", async () => {
    const client = new LarkClient({ accessToken: "token_123", baseUrl: "https://open.larksuite.com" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock.mockResolvedValueOnce({
      code: 0,
      data: { items: [{ field_id: "fld_1", field_name: "来源" }] },
    });

    await expect(client.getFields("base_123", "tbl_456")).resolves.toEqual([
      { field_id: "fld_1", field_name: "来源" },
    ]);
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: "/open-apis/bitable/v1/apps/base_123/tables/tbl_456/fields",
    }), expect.anything());
  });

  it("sends a direct message with an open_id", async () => {
    const client = new LarkClient({ accessToken: "token_123", baseUrl: "https://open.larksuite.com" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock.mockResolvedValueOnce({ code: 0, data: { message_id: "om_123" } });

    await expect(client.sendMessage(
      "open_id",
      "ou_user_123",
      "text",
      JSON.stringify({ text: "Hello" }),
    )).resolves.toEqual({ message_id: "om_123" });
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      url: "/open-apis/im/v1/messages",
      data: {
        receive_id: "ou_user_123",
        msg_type: "text",
        content: JSON.stringify({ text: "Hello" }),
      },
      params: { receive_id_type: "open_id" },
    }), expect.anything());
  });

  it("preserves records created before a later batch fails", async () => {
    const client = new LarkClient({ accessToken: "token_123", baseUrl: "https://open.larksuite.com" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock
      .mockResolvedValueOnce({ code: 0, data: { records: [{ record_id: "rec_1", fields: {} }] } })
      .mockRejectedValueOnce(new Error("rate limited"));

    const records = Array.from({ length: 201 }, (_, index) => ({ 描述: String(index) }));
    await expect(client.batchCreateRecords("base_123", "tbl_456", records)).rejects.toMatchObject({
      name: "LarkBatchCreateError",
      createdRecords: [expect.objectContaining({ record_id: "rec_1" })],
    });
  });
});
