import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLarkBaseBulkWorkflowController,
  previewLarkBaseBulkWorkflowController,
} from "./lark-base-bulk-workflow.controller.js";

const previewLarkBaseBulkWorkflowMock = vi.fn();
const executeLarkBaseBulkWorkflowMock = vi.fn();

vi.mock("./lark-base-bulk-workflow.service.js", () => ({
  previewLarkBaseBulkWorkflow: (...args: unknown[]) =>
    previewLarkBaseBulkWorkflowMock(...args),
  executeLarkBaseBulkWorkflow: (...args: unknown[]) =>
    executeLarkBaseBulkWorkflowMock(...args),
}));

describe("lark-base-bulk-workflow.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and forwards the preview request", async () => {
    previewLarkBaseBulkWorkflowMock.mockResolvedValueOnce({
      ok: true,
      baseId: "base_123",
      tableId: "tbl_456",
      viewId: "vew_789",
      totalRecordsInView: 1,
      eligibleRecords: [],
      skippedRecords: [],
    });

    const result = await previewLarkBaseBulkWorkflowController({
      baseId: "base_123",
      tableId: "tbl_456",
      viewId: "vew_789",
      masterUserId: "usr_xxx",
    });

    expect(previewLarkBaseBulkWorkflowMock).toHaveBeenCalledWith({
      baseId: "base_123",
      tableId: "tbl_456",
      viewId: "vew_789",
      masterUserId: "usr_xxx",
    });
    expect(result).toEqual({
      ok: true,
      baseId: "base_123",
      tableId: "tbl_456",
      viewId: "vew_789",
      totalRecordsInView: 1,
      eligibleRecords: [],
      skippedRecords: [],
    });
  });

  it("validates and forwards the execute request", async () => {
    executeLarkBaseBulkWorkflowMock.mockResolvedValueOnce({
      ok: true,
      baseId: "base_123",
      tableId: "tbl_456",
      viewId: "vew_789",
      totalRecordsInView: 1,
      summary: { created: 1, failed: 0, skipped: 0 },
      createdRecords: [],
      failedRecords: [],
      skippedRecords: [],
    });

    const result = await createLarkBaseBulkWorkflowController({
      baseId: "base_123",
      tableId: "tbl_456",
      viewId: "vew_789",
      masterUserId: "usr_xxx",
    });

    expect(executeLarkBaseBulkWorkflowMock).toHaveBeenCalledWith({
      baseId: "base_123",
      tableId: "tbl_456",
      viewId: "vew_789",
      masterUserId: "usr_xxx",
    });
    expect(result.ok).toBe(true);
  });

  it("returns invalid request when required fields are missing", async () => {
    const result = await previewLarkBaseBulkWorkflowController({
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
});
