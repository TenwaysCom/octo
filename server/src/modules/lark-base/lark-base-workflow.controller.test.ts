import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLarkBaseWorkflowController } from "./lark-base-workflow.controller.js";

const executeLarkBaseWorkflowMock = vi.fn();

vi.mock("./lark-base-workflow.service.js", () => ({
  executeLarkBaseWorkflow: (...args: unknown[]) =>
    executeLarkBaseWorkflowMock(...args),
}));

describe("lark-base-workflow.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Meegle workitem and updates the Lark record successfully", async () => {
    executeLarkBaseWorkflowMock.mockResolvedValueOnce({
      ok: true,
      workitemId: "12345",
      meegleLink: "https://meego.feishu.cn/issue/12345",
      recordId: "rec_abc",
    });

    const result = await createLarkBaseWorkflowController({
      recordId: "rec_abc",
      masterUserId: "usr_xxx",
    });

    expect(result).toEqual({
      ok: true,
      workitemId: "12345",
      meegleLink: "https://meego.feishu.cn/issue/12345",
      recordId: "rec_abc",
    });
    expect(executeLarkBaseWorkflowMock).toHaveBeenCalledWith({
      recordId: "rec_abc",
      masterUserId: "usr_xxx",
    });
  });

  it("passes optional overrides to the service", async () => {
    executeLarkBaseWorkflowMock.mockResolvedValueOnce({
      ok: true,
      workitemId: "12345",
      meegleLink: "https://meego.feishu.cn/issue/12345",
      recordId: "rec_abc",
    });

    await createLarkBaseWorkflowController({
      recordId: "rec_abc",
      masterUserId: "usr_xxx",
      baseId: "base_123",
      tableId: "tbl_456",
      projectKey: "proj_789",
    });

    expect(executeLarkBaseWorkflowMock).toHaveBeenCalledWith({
      recordId: "rec_abc",
      masterUserId: "usr_xxx",
      baseId: "base_123",
      tableId: "tbl_456",
      projectKey: "proj_789",
    });
  });

  it("returns invalid request for missing required fields", async () => {
    const result = await createLarkBaseWorkflowController({
      baseId: "base_123",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        errorCode: "INVALID_REQUEST",
        errorMessage: expect.any(String),
      },
    });
  });

  it("returns update failed when service throws unexpectedly", async () => {
    executeLarkBaseWorkflowMock.mockRejectedValueOnce(
      new Error("Unexpected error"),
    );

    const result = await createLarkBaseWorkflowController({
      recordId: "rec_abc",
      masterUserId: "usr_xxx",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        errorCode: "UPDATE_FAILED",
        errorMessage: "Unexpected error",
      },
    });
  });
});
