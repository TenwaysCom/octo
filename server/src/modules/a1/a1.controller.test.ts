import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeegleApplyError } from "../../application/services/meegle-apply.service.js";
import { applyB2Controller } from "./a1.controller.js";

const applyB2Mock = vi.fn();

vi.mock("../../application/services/a1-workflow.service.js", () => ({
  analyzeA1: vi.fn(),
  createB2Draft: vi.fn(),
  applyB2: (...args: unknown[]) => applyB2Mock(...args),
}));

describe("a1.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a structured business error for missing Meegle binding", async () => {
    applyB2Mock.mockRejectedValueOnce(
      new MeegleApplyError(
        "MEEGLE_BINDING_REQUIRED",
        "Need Meegle binding",
      ),
    );

    await expect(
      applyB2Controller({
        requestId: "req_001",
        draftId: "draft_b2_rec_001",
        operatorLarkId: "ou_apply",
        sourceRecordId: "rec_001",
        idempotencyKey: "idem_001",
        confirmedDraft: {
          name: "支付页白屏",
          fieldValuePairs: [
            {
              fieldKey: "priority",
              fieldValue: "P1",
            },
          ],
          ownerUserKeys: [],
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        errorCode: "MEEGLE_BINDING_REQUIRED",
        errorMessage: "Need Meegle binding",
      },
    });
  });

  it("accepts an optional masterUserId on apply requests", async () => {
    applyB2Mock.mockResolvedValueOnce({
      status: "created",
      workitemId: "B2-123",
      draft: {
        draftId: "draft_b2_rec_001",
      },
    });

    await applyB2Controller({
      requestId: "req_001",
      masterUserId: "usr_xxx",
      draftId: "draft_b2_rec_001",
      operatorLarkId: "ou_apply",
        sourceRecordId: "rec_001",
        idempotencyKey: "idem_001",
        confirmedDraft: {
          name: "支付页白屏",
          fieldValuePairs: [
            {
              fieldKey: "priority",
              fieldValue: "P1",
            },
          ],
          ownerUserKeys: [],
        },
      });

    expect(applyB2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        masterUserId: "usr_xxx",
      }),
    );
  });
});
