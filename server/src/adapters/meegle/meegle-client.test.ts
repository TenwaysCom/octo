import { describe, it, expect } from "vitest";
import {
  MeegleClient,
  MeegleMinimumIntervalLimiter,
  parseWorkitem,
} from "./meegle-client.js";

describe("parseWorkitem", () => {
  it("should parse basic fields", () => {
    const result = parseWorkitem({
      id: "123",
      key: "M-123",
      name: "Test Item",
      type: "story",
      status: "open",
      assignee: "user1",
    });

    expect(result.id).toBe("123");
    expect(result.key).toBe("M-123");
    expect(result.name).toBe("Test Item");
    expect(result.type).toBe("story");
    expect(result.status).toBe("open");
    expect(result.assignee).toBe("user1");
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
