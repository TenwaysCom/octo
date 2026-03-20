import { describe, expect, it } from "vitest";
import {
  analyzeA1Controller,
  createB2DraftController,
} from "../src/modules/a1/a1.controller";

describe("a1.controller", () => {
  it("returns documented analyze contract", async () => {
    await expect(
      analyzeA1Controller({
        recordId: "recA1_001",
      }),
    ).resolves.toMatchObject({
      summary: expect.any(String),
      decision: "to_b2",
      riskLevel: expect.any(String),
      nextActions: expect.any(Array),
    });
  });

  it("returns documented draft contract", async () => {
    await expect(
      createB2DraftController({
        recordId: "recA1_001",
      }),
    ).resolves.toMatchObject({
      draftId: "draft_b2_recA1_001",
      sourceRef: {
        sourcePlatform: "lark_a1",
        sourceRecordId: "recA1_001",
      },
      target: {
        projectKey: "OPS",
        workitemTypeKey: "bug",
      },
      fieldValuePairs: expect.any(Array),
      needConfirm: true,
    });
  });
});
