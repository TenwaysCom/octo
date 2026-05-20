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
          loadLarkTicketItems: async () => [
            { id: "LarkTicket-1", projectKey: "PROJ1", issueType: "Bug", status: "open", ageDays: 4 },
          ],
          loadMeegleWorkitemItems: async () => [
            { id: "MeegleWI-1", projectKey: "PROJ1", status: "in_progress", ageDays: 2 },
          ],
          loadPRItems: async () => [],
        },
      ),
    ).resolves.toMatchObject({
      staleItems: [expect.objectContaining({ id: "LarkTicket-1" })],
    });
  });
});
