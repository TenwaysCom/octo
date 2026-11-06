import { vi } from "vitest";
import { LarkAPIError, LarkBatchCreateError, LarkClient, isLarkWriteDefinitelyRejected, classifyLarkRecordError } from "./lark-client.js";

describe("lark-client", () => {
  it.each([
    [1254043, "record-not-found"], [1254040, "resource-not-found"], [1254041, "resource-not-found"],
    [403, "forbidden"], [99991672, "forbidden"], [99991676, "forbidden"],
    [99991668, "auth-required"], [99991677, "auth-required"], [99991679, "auth-required"],
    [404, undefined], [500, undefined], [1254044, undefined],
  ])("classifies platform code %s without treating generic failures as deleted records", (code, expected) => {
    expect(classifyLarkRecordError(new LarkAPIError("test", code as number))).toBe(expected);
    expect(classifyLarkRecordError(new Error("RecordIdNotFound"))).toBeUndefined();
  });
  const requestMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists paginated DONE reactions and preserves reaction identity on creation", async () => {
    const client = new LarkClient({ accessToken: "test-token" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    const reaction = { reaction_id: "reaction_1", operator: { operator_type: "app", operator_id: "cli_app" }, reaction_type: { emoji_type: "DONE" } };
    requestMock.mockResolvedValueOnce({ code: 0, data: { items: [reaction], has_more: true, page_token: "next" } });
    await expect(client.listMessageReactions("om_root", { emojiType: "DONE", pageToken: "previous" }))
      .resolves.toEqual({ items: [reaction], hasMore: true, pageToken: "next" });
    expect(requestMock).toHaveBeenLastCalledWith(expect.objectContaining({
      method: "GET", url: "/open-apis/im/v1/messages/om_root/reactions",
      params: { reaction_type: "DONE", page_token: "previous", page_size: 50 },
    }), expect.anything());
    requestMock.mockResolvedValueOnce({ code: 0, data: reaction });
    await expect(client.createMessageReaction("om_root", "DONE")).resolves.toEqual(reaction);
    expect(requestMock).toHaveBeenLastCalledWith(expect.objectContaining({
      method: "POST", data: { reaction_type: { emoji_type: "DONE" } },
    }), expect.anything());
  });

  it.each([
    { name: "permission refusal", reject: true, response: { response: { status: 403, data: { code: 99991672, msg: "Forbidden" } } }, definite: true },
    { name: "platform rate limit", reject: false, response: { code: 99991400, msg: "Rate limited" }, definite: true },
    { name: "HTTP server failure", reject: true, response: { response: { status: 500, data: { code: 1255001, msg: "Server error" } } }, definite: false },
    { name: "transport timeout", reject: true, response: new Error("TIMEOUT"), definite: false },
  ])("distinguishes a normalized $name from an uncertain write", async ({ reject, response, definite }) => {
    const client = new LarkClient({ accessToken: "test-token" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    if (reject) requestMock.mockRejectedValueOnce(response);
    else requestMock.mockResolvedValueOnce(response);
    let failure: unknown;
    try { await client.createRecord("base", "table", { Title: "test" }); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(LarkAPIError);
    expect(isLarkWriteDefinitelyRejected(failure)).toBe(definite);
  });

  it.each(["application", "user"] as const)("authenticates %s requests using the intended identity", async (identity) => {
    const client = new LarkClient(identity === "application"
      ? { appId: "cli_app", appSecret: "app-secret", baseUrl: "https://open.larksuite.com" }
      : { accessToken: "user-token", baseUrl: "https://open.larksuite.com" });
    const sdk = (client as unknown as { client: {
      appId: string;
      tokenManager: { getTenantAccessToken: () => Promise<string> };
      httpInstance: { request: (...args: unknown[]) => Promise<unknown> };
    } }).client;
    const tenantToken = vi.fn().mockResolvedValue("tenant-token");
    const httpRequest = vi.fn().mockResolvedValue({ code: 0, data: { items: [] } });
    sdk.tokenManager.getTenantAccessToken = tenantToken;
    sdk.httpInstance = { request: httpRequest };

    await client.getFields("base", "table");

    expect(httpRequest).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${identity === "application" ? "tenant-token" : "user-token"}` }),
    }));
    expect(tenantToken).toHaveBeenCalledTimes(identity === "application" ? 1 : 0);
    if (identity === "application") expect(sdk.appId).toBe("cli_app");
  });

  it.each(["application", "user"] as const)("suppresses raw SDK %s errors that could expose credentials", (identity) => {
    const stdoutLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const client = new LarkClient(identity === "application"
        ? { appId: "cli_app", appSecret: "test-secret" }
        : { accessToken: "test-token" });
      const sdk = (client as unknown as { client: { logger: { error: (...args: unknown[]) => void } } }).client;
      sdk.logger.error({ config: { headers: { Authorization: "Bearer test-secret" }, data: { app_secret: "test-secret" } } });
      expect(stdoutLog).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
    } finally { errorLog.mockRestore(); stdoutLog.mockRestore(); }
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
      { withSharedUrl: true, automaticFields: true },
    );

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "/open-apis/bitable/v1/apps/base_123/tables/tbl_456/records/batch_get",
        data: {
          record_ids: ["rec_1", "rec_forbidden", "rec_missing"],
          with_shared_url: true,
          automatic_fields: true,
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

  it("paginates thread messages with a creation-time watermark and normalizes message metadata", async () => {
    const client = new LarkClient({ accessToken: "token_123", baseUrl: "https://open.larksuite.com" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock.mockResolvedValueOnce({
      code: 0,
      data: {
        items: [{
          message_id: "om_1",
          root_id: "root_1",
          msg_type: "text",
          create_time: "1787731200",
          update_time: "1787731260000",
          sender: { id: "ou_1", sender_type: "user" },
          body: { content: JSON.stringify({ text: "hello" }) },
        }],
        has_more: true,
        page_token: "page_2",
      },
    });

    await expect(client.getThreadMessages("thread_1", {
      startTime: "1787731140",
      pageToken: "page_1",
      sortType: "ByCreateTimeAsc",
    })).resolves.toEqual({
      items: [{
        message_id: "om_1",
        root_id: "root_1",
        parent_id: undefined,
        thread_id: undefined,
        msg_type: "text",
        create_time: "2026-08-26T08:00:00.000Z",
        update_time: "2026-08-26T08:01:00.000Z",
        deleted: undefined,
        updated: undefined,
        sender: { id: "ou_1", sender_type: "user" },
        content: JSON.stringify({ text: "hello" }),
      }],
      hasMore: true,
      pageToken: "page_2",
    });
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: "/open-apis/im/v1/messages",
      params: expect.objectContaining({
        container_id_type: "thread",
        container_id: "thread_1",
        start_time: "1787731140",
        page_token: "page_1",
        sort_type: "ByCreateTimeAsc",
      }),
    }), expect.anything());
  });

  it("reads the root message from the get-message items envelope", async () => {
    const client = new LarkClient({ accessToken: "token_123", baseUrl: "https://open.larksuite.com" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock.mockResolvedValueOnce({
      code: 0,
      data: { items: [{ message_id: "root_1", msg_type: "text", body: { content: "root" } }] },
    });

    await expect(client.getMessage("root_1")).resolves.toMatchObject({
      message_id: "root_1",
      msg_type: "text",
      content: "root",
    });
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

  it("lists bounded chat history and preserves the source chat/thread identity", async () => {
    const client = new LarkClient({ accessToken: "token", actionRunId: "trace" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock.mockResolvedValueOnce({ code: 0, data: { items: [{ message_id: "om_root", chat_id: "oc_chat", thread_id: "omt_thread", create_time: "1793664000000", body: { content: '{"text":"question"}' } }], has_more: true, page_token: "next" } });
    expect(await client.getChatMessages("oc_chat", { startTime: "1793664000", endTime: "1793667600", pageSize: 100 })).toMatchObject({ hasMore: true, pageToken: "next", items: [{ chat_id: "oc_chat", thread_id: "omt_thread", create_time: "2026-11-03T00:00:00.000Z" }] });
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ container_id_type: "chat", container_id: "oc_chat", start_time: "1793664000", end_time: "1793667600", page_size: 50 }) }), expect.anything());
  });

  it("sends stable creation and reply identifiers to Lark", async () => {
    const client = new LarkClient({ accessToken: "token" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock.mockResolvedValueOnce({ code: 0, data: { record: { record_id: "rec", fields: {} } } });
    await client.createRecord("base", "table", { Title: "ticket" }, { clientToken: "uuid" });
    expect(requestMock).toHaveBeenLastCalledWith(expect.objectContaining({ params: { client_token: "uuid" }, data: { fields: { Title: "ticket" } } }), expect.anything());
    requestMock.mockResolvedValueOnce({ code: 0, data: { message_id: "om_reply" } });
    await client.replyToMessage("om_root", "text", '{"text":"recorded"}', { reply_in_thread: true, uuid: "uuid" });
    expect(requestMock).toHaveBeenLastCalledWith(expect.objectContaining({ data: { msg_type: "text", content: '{"text":"recorded"}', reply_in_thread: true, uuid: "uuid" } }), expect.anything());
  });

  it("requests only selected Base columns when building the thread deduplication index", async () => {
    const client = new LarkClient({ accessToken: "token" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock.mockResolvedValueOnce({ code: 0, data: { items: [], has_more: false } });
    await client.listRecords("base", "table", { fieldNames: ["Lark Message Link"] });
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ field_names: '["Lark Message Link"]' }) }), expect.anything());
  });

  it("reads later field metadata pages before resolving intake field names", async () => {
    const client = new LarkClient({ accessToken: "token" });
    (client as unknown as { client: { request: typeof requestMock } }).client = { request: requestMock };
    requestMock.mockResolvedValueOnce({ code: 0, data: { items: [{ field_id: "title", field_name: "Title", type: 1 }], has_more: true, page_token: "fields2" } })
      .mockResolvedValueOnce({ code: 0, data: { items: [{ field_id: "link", field_name: "Lark Message Link", type: 15 }], has_more: false } });
    expect(await client.getFields("base", "table")).toHaveLength(2);
    expect(requestMock).toHaveBeenLastCalledWith(expect.objectContaining({ params: { page_size: 100, page_token: "fields2" } }), expect.anything());
  });
});
