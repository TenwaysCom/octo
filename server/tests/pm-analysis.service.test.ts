import { describe, expect, it } from "vitest";
import { runPMAnalysis } from "../src/application/services/pm-analysis.service";

describe("runPMAnalysis", () => {
  it("returns a structured analysis report", async () => {
    await expect(
      runPMAnalysis({
        projectKeys: ["PROJ1"],
      }),
    ).resolves.toMatchObject({
      summary: expect.any(String),
      totals: expect.objectContaining({
        staleA1Count: expect.any(Number),
        staleBItemsCount: expect.any(Number),
      }),
    });
  });
});
