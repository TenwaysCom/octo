import { describe, it, expect, vi } from "vitest";
import {
  MeegleClient,
  MeegleMinimumIntervalLimiter,
  parseWorkitemOperationRecord,
  parseWorkitem,
} from "./meegle-client.js";

describe("parseWorkitemOperationRecord", () => {
  it("normalizes operation records without retaining operator data", () => {
    expect(parseWorkitemOperationRecord({
      work_item_id: 14366398,
      work_item_type_key: "task",
      operation_type: "modify",
      operation_time: 1787815548711,
      op_record_module: "field_mod",
      operator: "user-secret",
      record_contents: [{
        object: { object_type: "field", object_value: "field_cycle" },
        object_property: null,
        old: [],
        new: [13658870],
      }],
    })).toEqual({
      workItemId: "14366398",
      workItemTypeKey: "task",
      operationType: "modify",
      operationTime: "2026-08-27T07:25:48.711Z",
      module: "field_mod",
      recordContents: [{
        objectType: "field",
        objectValue: "field_cycle",
        objectProperty: undefined,
        oldValues: [],
        newValues: ["13658870"],
      }],
    });
  });
});

describe("parseWorkitem", () => {
  it("should parse basic fields", () => {
    const result = parseWorkitem({
      id: "123",
      key: "M-123",
      name: "Test Item",
      type: "story",
      status: "open",
      assignee: "user1",
      priority: "P1",
    });

    expect(result.id).toBe("123");
    expect(result.key).toBe("M-123");
    expect(result.name).toBe("Test Item");
    expect(result.type).toBe("story");
    expect(result.status).toBe("open");
    expect(result.assignee).toBe("user1");
    expect(result.priority).toBe("P1");
  });

  it("uses the multi-user Current owner field as the assignee projection", () => {
    expect(parseWorkitem({
      id: "123",
      name: "Test Item",
      type: "story",
      assignee: "Legacy node owner",
      fields: {
        work_item_fields: [{
          key: "current_status_operator",
          value: [{ name: "Ada" }, { name: "Lin" }, { name: "Ada" }],
        }],
      },
    }).assignee).toBe("Ada, Lin");
  });

  it("does not fall back to a legacy assignee when Current owner is explicitly empty", () => {
    expect(parseWorkitem({
      id: "123",
      name: "Test Item",
      type: "story",
      assignee: "Legacy node owner",
      fields: {
        work_item_fields: [{ key: "current_status_operator", value: [] }],
      },
    }).assignee).toBeUndefined();
  });

  it("normalizes the source updated_at into the explicit snapshot version", () => {
    expect(parseWorkitem({
      id: "123",
      name: "Test Item",
      type: "story",
      updated_at: 1786020656000,
    }).updatedAt).toBe("2026-08-06 12:50:56");
    expect(parseWorkitem({
      id: "123",
      name: "Test Item",
      type: "story",
      updated_at: "invalid",
    }).updatedAt).toBeUndefined();
  });

  it("normalizes root and Production Bug creation timestamps", () => {
    expect(parseWorkitem({
      id: "123",
      name: "Story",
      type: "story",
      created_at: 1785931200000,
    }).createdAt).toBe("2026-08-05T12:00:00.000Z");
    expect(parseWorkitem({
      id: "124",
      name: "Production Bug",
      type: "production_bug",
      fields: { work_item_attribute: { create_time: "1785931200000" } },
    }).createdAt).toBe("2026-08-05T12:00:00.000Z");
  });

  it("uses Production Bug work_item_attribute.update_time instead of root updated_at", () => {
    expect(parseWorkitem({
      id: "123",
      name: "Production Bug",
      work_item_type_key: "6932e40429d1cd8aac635c82",
      updated_at: 1786020656000,
      fields: { work_item_attribute: { update_time: "1785920000000" } },
    }).updatedAt).toBe("2026-08-05 08:53:20");
    expect(parseWorkitem({
      id: "124",
      name: "Production Bug",
      type: "production_bug",
      updated_at: 1786020656000,
      fields: { work_item_attribute: { update_time: "1785920000000" } },
    }).updatedAt).toBe("2026-08-05 08:53:20");
  });

  it("should extract status from work_item_status.state_key when direct status is empty", () => {
    const result = parseWorkitem({
      id: "123",
      name: "Test Item",
      type: "story",
      status: "",
      fields: {
        work_item_status: { state_key: "sub_stage_1682410348054" },
      },
    });

    expect(result.status).toBe("sub_stage_1682410348054");
  });

  it("should extract status from fields.current_nodes[0].name", () => {
    const result = parseWorkitem({
      id: "123",
      name: "Test Item",
      type: "story",
      status: "",
      fields: {
        work_item_status: { state_key: "sub_stage_1682410348054" },
        current_nodes: [{ id: "state_24", name: "Server Launch", owners: [], milestone: false }],
      },
    });

    expect(result.status).toBe("Server Launch");
  });

  it("should also accept current_nodes and work_item_status at top level", () => {
    const result = parseWorkitem({
      id: "123",
      name: "Test Item",
      type: "story",
      status: "",
      current_nodes: [{ id: "state_24", name: "Top Level Node", owners: [], milestone: false }],
      work_item_status: { state_key: "sub_stage_xxx" },
    });

    expect(result.status).toBe("Top Level Node");
  });

  it("should fallback to state when status is missing", () => {
    const result = parseWorkitem({
      id: "123",
      name: "Test Item",
      type: "story",
      state: "in_progress",
    });

    expect(result.status).toBe("in_progress");
  });

  it("should collect non-reserved fields into fields object", () => {
    const result = parseWorkitem({
      id: "123",
      name: "Test Item",
      type: "story",
      custom_field: "value",
      project_key: "proj1",
    });

    expect(result.fields.custom_field).toBe("value");
    expect(result.fields.project_key).toBe("proj1");
    expect(result.fields.id).toBeUndefined();
    expect(result.fields.name).toBeUndefined();
  });

  it("should flatten nested Meegle fields so field value pairs stay readable", () => {
    const result = parseWorkitem({
      id: "123",
      name: "Production Bug",
      type: "production_bug",
      fields: {
        fields: [
          {
            field_key: "field_8d0341",
            field_value: "https://applink.larksuite.com/client/thread/open?threadid=thread_1",
          },
        ],
        work_item_status: { state_key: "started" },
      },
    });

    expect(result.fields.fields).toEqual([
      {
        field_key: "field_8d0341",
        field_value: "https://applink.larksuite.com/client/thread/open?threadid=thread_1",
      },
    ]);
    expect(result.fields.work_item_status).toEqual({ state_key: "started" });
  });

  it("should preserve top-level Meegle field pair arrays", () => {
    const result = parseWorkitem({
      id: "13290007",
      name: "Production Bug",
      work_item_type_key: "6932e40429d1cd8aac635c82",
      fields: [
        {
          field_key: "field_c22a1a",
          field_alias: "lark_update_message",
          field_name: "Lark Update Message",
          field_type_key: "text",
          field_value: "Hello, your request has been released.",
        },
        {
          field_key: "field_8d0341",
          field_alias: "lark_message_link",
          field_name: "Lark Message Link",
          field_type_key: "text",
          field_value: "https://applink.larksuite.com/client/thread/open?threadid=thread_1",
        },
      ],
    });

    expect(result.fields.fields).toEqual([
      {
        field_key: "field_c22a1a",
        field_alias: "lark_update_message",
        field_name: "Lark Update Message",
        field_type_key: "text",
        field_value: "Hello, your request has been released.",
      },
      {
        field_key: "field_8d0341",
        field_alias: "lark_message_link",
        field_name: "Lark Message Link",
        field_type_key: "text",
        field_value: "https://applink.larksuite.com/client/thread/open?threadid=thread_1",
      },
    ]);
  });

  it("serializes requests with the configured minimum interval", async () => {
    const waits: number[] = [];
    let now = 1_000;
    const limiter = new MeegleMinimumIntervalLimiter(
      250,
      () => now,
      async (waitMs) => {
        waits.push(waitMs);
        now += waitMs;
      },
    );

    await Promise.all([limiter.wait(), limiter.wait(), limiter.wait()]);

    expect(waits).toEqual([250, 250]);
  });

  it("retries HTTP 429 with Retry-After but does not retry commercial usage exhaustion", async () => {
    const requestLimiter = { wait: vi.fn().mockResolvedValue(undefined) };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ err_msg: "too many requests" }), {
        status: 429,
        headers: { "Retry-After": "2" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { items: [{ user_key: "user-1", name_en: "User" }] },
      }), { status: 200 }));
    const client = new MeegleClient({ userToken: "token", userKey: "user" }, {
      requestLimiter,
      sleep,
      fetch,
      maxRateLimitRetries: 1,
    });

    await expect(client.getUsers(["user-1"])).resolves.toEqual([{
      user_key: "user-1",
      name: "User",
      email: "",
      avatar: undefined,
      role: undefined,
    }]);
    expect(requestLimiter.wait).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);

    const quotaFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      err_code: 1000051942,
      err_msg: "Commercial Usage Exceeded",
    }), { status: 400 }));
    const quotaClient = new MeegleClient({ userToken: "token", userKey: "user" }, {
      requestLimiter,
      sleep,
      fetch: quotaFetch,
      maxRateLimitRetries: 1,
    });

    await expect(quotaClient.getUsers(["user-1"])).rejects.toThrow("Commercial Usage Exceeded");
    expect(quotaFetch).toHaveBeenCalledTimes(1);
  });
});

describe("MeegleClient operation records", () => {
  it("paginates operation records with the returned cursor", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          has_more: true,
          start_from: "cursor-2",
          op_records: [{
            work_item_id: 1,
            work_item_type_key: "story",
            operation_type: "create",
            operation_time: 1787815256465,
            op_record_module: "work_item_mod",
            record_contents: [],
          }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { has_more: false, start_from: "", op_records: [] },
      }), { status: 200 }));
    const client = new MeegleClient({ userToken: "token", userKey: "user" }, {
      fetch,
      requestLimiter: { wait: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(client.listWorkitemOperationRecords("project", ["1"])).resolves.toHaveLength(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      project_key: "project",
      work_item_ids: [1],
      op_record_module: ["field_mod", "work_item_mod"],
    });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ start_from: "cursor-2" });
  });
});
