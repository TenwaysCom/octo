import { describe, expect, it } from "vitest";
import { createB2Draft } from "../src/application/services/a1-workflow.service";

describe("createB2Draft", () => {
  it("returns a confirmable execution draft", async () => {
    await expect(createB2Draft({ recordId: "recA1_001" })).resolves.toMatchObject({
      needConfirm: true,
      draftType: "b2",
      draftId: "draft_b2_recA1_001",
      sourceRef: {
        sourcePlatform: "lark_a1",
        sourceRecordId: "recA1_001",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "bug",
      },
    });
  });
});
