import { describe, expect, it } from "vitest";
import { createB1Draft } from "../src/application/services/a2-workflow.service";

describe("createB1Draft", () => {
  it("returns a confirmable b1 draft", async () => {
    await expect(createB1Draft({ recordId: "recA2_001" })).resolves.toMatchObject({
      needConfirm: true,
      draftType: "b1",
      draftId: "draft_b1_recA2_001",
      sourceRef: {
        sourcePlatform: "lark_a2",
        sourceRecordId: "recA2_001",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "requirement",
      },
    });
  });
});
