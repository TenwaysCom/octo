import { describe, expect, it } from "vitest";
import {
  analyzeA2Controller,
  createB1DraftController,
} from "../src/modules/a2/a2.controller";

describe("a2.controller", () => {
  it("returns documented analyze contract", async () => {
    await expect(
      analyzeA2Controller({
        recordId: "recA2_001",
      }),
    ).resolves.toMatchObject({
      summary: expect.any(String),
      readiness: expect.any(String),
      nextActions: expect.any(Array),
    });
  });

  it("returns documented draft contract", async () => {
    await expect(
      createB1DraftController({
        recordId: "recA2_001",
      }),
    ).resolves.toMatchObject({
      draftId: "draft_b1_recA2_001",
      sourceRef: {
        sourcePlatform: "lark_a2",
        sourceRecordId: "recA2_001",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "requirement",
      },
      fieldValuePairs: expect.any(Array),
      needConfirm: true,
    });
  });
});
