import { describe, expect, it } from "vitest";
import { validateA1ApplyRequest } from "./a1.dto.js";

describe("a1.dto", () => {
  it("accepts apply requests when only masterUserId is present", () => {
    expect(
      validateA1ApplyRequest({
        requestId: "req_001",
        draftId: "draft_b2_001",
        masterUserId: "master_user_001",
        sourceRecordId: "record_001",
        idempotencyKey: "idem_001",
        confirmedDraft: {
          name: "支付页白屏",
          fieldValuePairs: [
            {
              fieldKey: "priority",
              fieldValue: "P1",
            },
          ],
          ownerUserKeys: ["owner_a"],
        },
      }),
    ).toMatchObject({
      masterUserId: "master_user_001",
    });
  });

  it("rejects apply requests when both masterUserId and operatorLarkId are missing", () => {
    expect(() =>
      validateA1ApplyRequest({
        requestId: "req_001",
        draftId: "draft_b2_001",
        sourceRecordId: "record_001",
        idempotencyKey: "idem_001",
        confirmedDraft: {
          name: "支付页白屏",
          fieldValuePairs: [],
          ownerUserKeys: [],
        },
      }),
    ).toThrow(/masterUserId|operatorLarkId/i);
  });
});
