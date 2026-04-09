import { describe, expect, it } from "vitest";
import { validateA2ApplyRequest } from "./a2.dto.js";

describe("a2.dto", () => {
  it("accepts apply requests when only masterUserId is present", () => {
    expect(
      validateA2ApplyRequest({
        requestId: "req_001",
        draftId: "draft_b1_001",
        masterUserId: "master_user_001",
        sourceRecordId: "record_001",
        idempotencyKey: "idem_001",
        confirmedDraft: {
          name: "需求整理",
          fieldValuePairs: [
            {
              fieldKey: "priority",
              fieldValue: "high",
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
      validateA2ApplyRequest({
        requestId: "req_001",
        draftId: "draft_b1_001",
        sourceRecordId: "record_001",
        idempotencyKey: "idem_001",
        confirmedDraft: {
          name: "需求整理",
          fieldValuePairs: [],
          ownerUserKeys: [],
        },
      }),
    ).toThrow(/masterUserId|operatorLarkId/i);
  });
});
