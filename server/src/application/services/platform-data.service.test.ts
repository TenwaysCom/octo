import type { PlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { PlatformDataService } from "./platform-data.service.js";

describe("PlatformDataService", () => {
  it("attaches linked GitHub PR summaries to the requested Meegle workitems", async () => {
    const store = {
      listMeegleWorkitems: vi.fn().mockResolvedValue([{
        projectKey: "project",
        workItemTypeKey: "story",
        workItemId: "123",
        title: "Story",
        syncedAt: "2026-08-09T00:00:00.000Z",
      }]),
      listMeegleSprints: vi.fn().mockResolvedValue(["Sprint 1"]),
      listGitHubPullRequestLinks: vi.fn().mockResolvedValue([{
        meegleId: "123",
        owner: "TenwaysCom",
        repo: "Tenways",
        pullNumber: 1138,
        title: "Linked PR",
        htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
        baseRef: "main",
        state: "merged",
      }]),
    } as unknown as PlatformSyncStore;
    const service = new PlatformDataService(store);

    await expect(service.list("meegle-workitems", 50, { sprint: "Sprint 1" })).resolves.toEqual({
      items: [expect.objectContaining({
        workItemId: "123",
        githubPullRequests: [expect.objectContaining({ pullNumber: 1138, baseRef: "main", state: "merged" })],
      })],
      sprints: ["Sprint 1"],
    });
    expect(store.listMeegleWorkitems).toHaveBeenCalledWith(50, "Sprint 1");
    expect(store.listGitHubPullRequestLinks).toHaveBeenCalledWith(["123"]);
  });
});
