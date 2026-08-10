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
        headRef: "feature/m-123",
        baseRef: "main",
        state: "merged",
      }]),
    } as unknown as PlatformSyncStore;
    const service = new PlatformDataService(store);

    await expect(service.list("meegle-workitems", 50, { sprint: "Sprint 1" })).resolves.toEqual({
      items: [expect.objectContaining({
        workItemId: "123",
        githubPullRequests: [expect.objectContaining({ pullNumber: 1138, headRef: "feature/m-123", baseRef: "main", state: "merged", odooShBuilds: [] })],
      })],
      sprints: ["Sprint 1"],
    });
    expect(store.listMeegleWorkitems).toHaveBeenCalledWith(50, "Sprint 1");
    expect(store.listGitHubPullRequestLinks).toHaveBeenCalledWith(["123"]);
  });

  it("matches Odoo.sh builds only against the linked PR head ref", async () => {
    const store = {
      listMeegleWorkitems: vi.fn().mockResolvedValue([{
        projectKey: "project",
        workItemTypeKey: "story",
        workItemId: "123",
        title: "Story",
        system: "Odoo UK",
        syncedAt: "2026-08-09T00:00:00.000Z",
      }]),
      listMeegleSprints: vi.fn().mockResolvedValue([]),
      listGitHubPullRequestLinks: vi.fn().mockResolvedValue([
        {
          meegleId: "123", owner: "TenwaysCom", repo: "Tenways", pullNumber: 1138,
          title: "Exact branch", htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
          headRef: "feature/m-123", state: "open",
        },
        {
          meegleId: "123", owner: "TenwaysCom", repo: "Tenways", pullNumber: 1139,
          title: "Different branch", htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1139",
          headRef: "feature/m-123-extra", state: "open",
        },
      ]),
    } as unknown as PlatformSyncStore;
    const odooDevopsBranchesService = {
      list: vi.fn(async (environment: "eu" | "uk" | "us") => {
        if (environment === "us") {
          throw new Error("unavailable");
        }
        return {
          environment,
          project_name: "Odoo",
          total: 1,
          items: [{
            branch: "feature/m-123",
            stage: "dev",
            last_build_status: "done",
            last_build_result: environment === "eu" ? "success" : "warning",
            odoo_branch: "17.0",
          }],
          cached: false,
        };
      }),
    };
    const service = new PlatformDataService(store, odooDevopsBranchesService);

    await expect(service.list("meegle-workitems", 50)).resolves.toMatchObject({
      items: [expect.objectContaining({
        githubPullRequests: [
          expect.objectContaining({
            pullNumber: 1138,
            odooShBuilds: [
              { environment: "uk", status: "done", result: "warning" },
            ],
          }),
          expect.objectContaining({ pullNumber: 1139, odooShBuilds: [] }),
        ],
      })],
    });
    expect(odooDevopsBranchesService.list).toHaveBeenCalledWith("uk");
  });

  it("attaches exact Odoo.sh build matches to GitHub PR list rows", async () => {
    const store = {
      listGitHubPullRequests: vi.fn().mockResolvedValue([
        {
          owner: "TenwaysCom", repo: "tenways-ukk", pullNumber: 1138, title: "Exact branch",
          state: "open", htmlUrl: "https://github.com/TenwaysCom/tenways-ukk/pull/1138",
          headRef: "feature/m-123", baseRef: "main", isDraft: false, meegleIds: ["123"],
          syncedAt: "2026-08-10T00:00:00.000Z",
        },
        {
          owner: "TenwaysCom", repo: "tenways-ukk", pullNumber: 1139, title: "Different branch",
          state: "open", htmlUrl: "https://github.com/TenwaysCom/tenways-ukk/pull/1139",
          headRef: "feature/m-123-extra", baseRef: "main", isDraft: false, meegleIds: [],
          syncedAt: "2026-08-10T00:00:00.000Z",
        },
      ]),
    } as unknown as PlatformSyncStore;
    const odooDevopsBranchesService = {
      list: vi.fn(async (environment: "eu" | "uk" | "us") => ({
        environment,
        project_name: "Odoo",
        total: 1,
        items: [{
          branch: "feature/m-123",
          stage: "dev",
          last_build_status: "done",
          last_build_result: "success",
          odoo_branch: "17.0",
        }],
        cached: false,
      })),
    };
    const service = new PlatformDataService(store, odooDevopsBranchesService);

    await expect(service.list("github-pull-requests", 50)).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          pullNumber: 1138,
          odooShBuilds: [
            { environment: "uk", status: "done", result: "success" },
          ],
        }),
        expect.objectContaining({ pullNumber: 1139, odooShBuilds: [] }),
      ],
    });
    expect(odooDevopsBranchesService.list).toHaveBeenCalledWith("uk");
  });
});
