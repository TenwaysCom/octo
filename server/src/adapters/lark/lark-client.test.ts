import { beforeEach, describe, expect, it, vi } from "vitest";
import { LarkClient } from "./lark-client.js";

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
            created_time: "2026-04-16T10:00:00Z",
            updated_time: "2026-04-16T10:05:00Z",
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
          created_time: "2026-04-16T10:00:00Z",
          updated_time: "2026-04-16T10:05:00Z",
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
          created_time: "2026-04-18T10:00:00Z",
          updated_time: "2026-04-18T10:05:00Z",
          shared_url: undefined,
        },
      ],
      hasMore: true,
      nextPageToken: "next_page_token",
    });
  });
});
