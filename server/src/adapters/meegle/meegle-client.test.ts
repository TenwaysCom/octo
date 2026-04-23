import { describe, it, expect } from "vitest";
import { parseWorkitem } from "./meegle-client.js";

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
      work_item_status: { state_key: "sub_stage_1682410348054" },
    });

    expect(result.status).toBe("sub_stage_1682410348054");
  });

  it("should prefer current_nodes[0].name for human-readable status", () => {
    const result = parseWorkitem({
      id: "123",
      name: "Test Item",
      type: "story",
      status: "",
      work_item_status: { state_key: "sub_stage_1682410348054" },
      current_nodes: [{ id: "state_24", name: "Server Launch", owners: [], milestone: false }],
    });

    expect(result.status).toBe("Server Launch");
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
});
