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
      blockers: expect.any(Array),
      staleItems: expect.any(Array),
      missingDescriptionItems: expect.any(Array),
      suggestedActions: expect.any(Array),
    });
  });

  it("uses timeWindowDays to scope stale items", async () => {
    await expect(
      runPMAnalysis(
        {
          projectKeys: ["PROJ1"],
          timeWindowDays: 3,
        },
        {
          loadA1Items: async () => [
            { id: "A1-1", projectKey: "PROJ1", status: "open", ageDays: 4 },
          ],
          loadA2Items: async () => [],
          loadBItems: async () => [
            { id: "B2-1", projectKey: "PROJ1", status: "in_progress", ageDays: 2 },
          ],
          loadPRItems: async () => [],
        },
      ),
    ).resolves.toMatchObject({
      staleItems: [expect.objectContaining({ id: "A1-1" })],
    });
  });
});
