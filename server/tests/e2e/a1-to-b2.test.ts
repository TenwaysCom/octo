import { describe, expect, it } from "vitest";
import { executeA1ToB2Flow } from "../../src/application/services/a1-workflow.service";

describe("a1 to b2 e2e", () => {
  it("creates a confirmable draft and applies it", async () => {
    await expect(
      executeA1ToB2Flow({
        recordId: "recA1_001",
      }),
    ).resolves.toMatchObject({
      status: "created",
      workitemId: "B2-001",
      draft: expect.objectContaining({
        draftType: "b2",
        draftId: "draft_b2_recA1_001",
        sourceRef: {
          sourcePlatform: "lark_a1",
          sourceRecordId: "recA1_001",
        },
      }),
    });
  });
});
