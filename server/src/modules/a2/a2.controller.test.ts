import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeegleApplyError } from "../../application/services/meegle-apply.service.js";
import { applyB1Controller } from "./a2.controller.js";

const applyB1Mock = vi.fn();

vi.mock("../../application/services/a2-workflow.service.js", () => ({
  analyzeA2: vi.fn(),
  createB1Draft: vi.fn(),
  applyB1: (...args: unknown[]) => applyB1Mock(...args),
}));

describe("a2.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a structured auth-required error when Meegle credentials are unavailable", async () => {
    applyB1Mock.mockRejectedValueOnce(
      new MeegleApplyError("MEEGLE_AUTH_REQUIRED", "Need Meegle auth"),
    );

    await expect(
      applyB1Controller({
        requestId: "req_002",
        draftId: "draft_b1_rec_002",
        operatorLarkId: "ou_apply",
        sourceRecordId: "rec_002",
        idempotencyKey: "idem_002",
        confirmedDraft: {
          name: "需求整理",
          fieldValuePairs: [
            {
              fieldKey: "priority",
              fieldValue: "high",
            },
          ],
          ownerUserKeys: [],
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        errorCode: "MEEGLE_AUTH_REQUIRED",
        errorMessage: "Need Meegle auth",
      },
    });
  });

  it("accepts an optional masterUserId on apply requests", async () => {
    applyB1Mock.mockResolvedValueOnce({
      status: "created",
      workitemId: "B1-123",
      draft: {
        draftId: "draft_b1_rec_002",
      },
    });

    await applyB1Controller({
      requestId: "req_002",
      masterUserId: "usr_xxx",
      draftId: "draft_b1_rec_002",
      operatorLarkId: "ou_apply",
        sourceRecordId: "rec_002",
        idempotencyKey: "idem_002",
        confirmedDraft: {
          name: "需求整理",
          fieldValuePairs: [
            {
              fieldKey: "priority",
              fieldValue: "high",
            },
          ],
          ownerUserKeys: [],
        },
      });

    expect(applyB1Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        masterUserId: "usr_xxx",
      }),
    );
  });
});
