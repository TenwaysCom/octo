import { describe, expect, it } from "vitest";
import { createB1Draft } from "../src/application/services/a2-workflow.service";

describe("createB1Draft", () => {
  it("returns a confirmable b1 draft", async () => {
    await expect(createB1Draft({ recordId: "recA2_001" })).resolves.toMatchObject({
      needConfirm: true,
      draftType: "b1",
      sourceRecordId: "recA2_001",
    });
  });
});
