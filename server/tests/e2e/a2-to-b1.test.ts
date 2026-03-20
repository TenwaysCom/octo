import { describe, expect, it } from "vitest";
import { executeA2ToB1Flow } from "../../src/application/services/a2-workflow.service";

describe("a2 to b1 e2e", () => {
  it("creates a confirmable draft and applies it", async () => {
    await expect(
      executeA2ToB1Flow({
        recordId: "recA2_001",
      }),
    ).resolves.toMatchObject({
      status: "created",
      workitemId: "B1-001",
      draft: expect.objectContaining({
        draftType: "b1",
        sourceRecordId: "recA2_001",
      }),
    });
  });
});
