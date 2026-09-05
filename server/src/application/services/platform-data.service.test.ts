import type { PlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { PlatformDataService } from "./platform-data.service.js";

describe("PlatformDataService", () => {
  it("returns the cleaned Lark requester and falls back to the existing source fields", async () => {
    const store = {
      listLarkBaseTickets: vi.fn().mockResolvedValue([
        {
          baseId: "base", tableId: "table", recordId: "rec-cleaned", title: "Cleaned",
          requester: "PM Ada", sourceFields: { 需求人: [{ name: "Ignored" }] }, syncedAt: "2026-08-09T00:00:00.000Z",
        },
        {
          baseId: "base", tableId: "table", recordId: "rec-legacy", title: "Legacy",
          sourceFields: { 需求人: [{ name: "PM Lin" }] }, syncedAt: "2026-08-08T00:00:00.000Z",
        },
      ]),
      countLarkBaseTickets: vi.fn().mockResolvedValue(2),
    } as unknown as PlatformSyncStore;
    const service = new PlatformDataService(store);

    const result = await service.list("lark-tickets", 50);
    expect(result).toEqual({
      items: [
        expect.objectContaining({ recordId: "rec-cleaned", requester: "PM Ada" }),
        expect.objectContaining({ recordId: "rec-legacy", requester: "PM Lin" }),
      ],
      total: 2,
    });
    expect(result.items[0]).not.toHaveProperty("sourceFields");
    expect(result.items[1]).not.toHaveProperty("sourceFields");
  });

  it("passes Lark Ticket filters to the snapshot store before projecting fields", async () => {
    const store = {
      listLarkBaseTickets: vi.fn().mockResolvedValue([]),
      countLarkBaseTickets: vi.fn().mockResolvedValue(0),
    } as unknown as PlatformSyncStore;
    const service = new PlatformDataService(store);
    const larkTickets = {
      createdAfter: "2026-08-01T00:00:00.000Z",
      sourceUpdatedAtBefore: "2026-08-31T23:59:59.999Z",
      issueTypes: ["Feature"],
    };

    await expect(service.list("lark-tickets", 50, { larkTickets })).resolves.toEqual({ items: [], total: 0 });
    expect(store.listLarkBaseTickets).toHaveBeenCalledWith(50, larkTickets);
  });

  it("attaches linked GitHub PR summaries to the requested Meegle workitems", async () => {
    const store = {
      listMeegleWorkitems: vi.fn().mockResolvedValue([{
        projectKey: "project",
        workItemTypeKey: "story",
        workItemId: "123",
        title: "Story",
        syncedAt: "2026-08-09T00:00:00.000Z",
      }]),
      countMeegleWorkitems: vi.fn().mockResolvedValue(1),
      listMeegleSprints: vi.fn().mockResolvedValue(["Sprint 1"]),
      listMeegleRelatedPersonOptions: vi.fn().mockResolvedValue([{
        memberKey: "u-1", name: "Ada", roleNames: ["Developer"],
      }]),
      listMeegleWorkitemRoleMembers: vi.fn().mockResolvedValue([{
        projectKey: "project", workItemTypeKey: "story", workItemId: "123",
        roleKey: "developer", roleName: "Developer", memberKey: "u-1", memberName: "Ada",
        roleOrder: 0, memberOrder: 0, syncedAt: "2026-08-09T00:00:00.000Z",
      }]),
      listMeegleSprintSnapshots: vi.fn().mockResolvedValue([{
        projectKey: "project",
        workItemTypeKey: "642ebe04168eea39eeb0d34a",
        workItemId: "sprint-1",
        title: "Sprint 1",
        status: "In progress",
        syncedAt: "2026-08-09T00:00:00.000Z",
        sourcePayload: {
          id: "sprint-1", key: "", name: "Sprint 1", type: "642ebe04168eea39eeb0d34a", status: "In progress",
          fields: { work_item_fields: [{ key: "description", value: "交付 Sprint" }] },
        },
      }]),
      listMeegleSprintMemberships: vi.fn().mockResolvedValue([{
        projectKey: "project",
        workItemTypeKey: "story",
        workItemId: "123",
        title: "Story",
        sprintId: "sprint-1",
        addToCycleTime: "2026-08-01T00:00:00.000Z",
        membershipSource: "incremental_observed",
        syncedAt: "2026-08-09T00:00:00.000Z",
      }]),
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
        isDraft: false,
      }]),
    } as unknown as PlatformSyncStore;
    const service = new PlatformDataService(store);

    await expect(service.list("meegle-workitems", 50, { meegleWorkitems: { sprints: ["Sprint 1"] } })).resolves.toEqual({
      items: [expect.objectContaining({
        workItemId: "123",
        githubPullRequests: [expect.objectContaining({ pullNumber: 1138, headRef: "feature/m-123", baseRef: "main", state: "merged", odooShBuilds: [] })],
        relatedPeople: [{ roleKey: "developer", roleName: "Developer", members: [{ memberKey: "u-1", name: "Ada" }] }],
      })],
      sprints: ["Sprint 1"],
      relatedPersonOptions: [{ memberKey: "u-1", name: "Ada", roleNames: ["Developer"] }],
      total: 1,
    });
    expect(store.listMeegleSprintSnapshots).not.toHaveBeenCalled();
    expect(store.listMeegleSprintMemberships).not.toHaveBeenCalled();

    await expect(service.listMeegleSprintHistory()).resolves.toEqual({
      sprintDetails: [expect.objectContaining({ sprintId: "sprint-1", name: "Sprint 1", description: "交付 Sprint" })],
      sprintWorkitems: [expect.objectContaining({
        workItemId: "123",
        sprintId: "sprint-1",
        sprint: "Sprint 1",
        membershipSource: "incremental_observed",
        githubPullRequests: [expect.objectContaining({ pullNumber: 1138 })],
        relatedPeople: [{ roleKey: "developer", roleName: "Developer", members: [{ memberKey: "u-1", name: "Ada" }] }],
      })],
    });
    expect(store.listMeegleWorkitems).toHaveBeenCalledWith(50, { sprints: ["Sprint 1"] });
    expect(store.listGitHubPullRequestLinks).toHaveBeenCalledWith(["123"]);
  });

  it("keeps Odoo.sh build lookups out of the Meegle workitem list", async () => {
    const store = {
      listMeegleWorkitems: vi.fn().mockResolvedValue([{
        projectKey: "project",
        workItemTypeKey: "story",
        workItemId: "123",
        title: "Story",
        system: "Odoo UK",
        syncedAt: "2026-08-09T00:00:00.000Z",
      }]),
      countMeegleWorkitems: vi.fn().mockResolvedValue(1),
      listMeegleSprints: vi.fn().mockResolvedValue([]),
      listMeegleRelatedPersonOptions: vi.fn().mockResolvedValue([]),
      listMeegleWorkitemRoleMembers: vi.fn().mockResolvedValue([]),
      listMeegleSprintSnapshots: vi.fn().mockResolvedValue([]),
      listMeegleSprintMemberships: vi.fn().mockResolvedValue([]),
      listGitHubPullRequestLinks: vi.fn().mockResolvedValue([
        {
          meegleId: "123", owner: "TenwaysCom", repo: "Tenways", pullNumber: 1138,
          title: "Exact branch", htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1138",
          headRef: "feature/m-123", state: "open",
          isDraft: false,
        },
        {
          meegleId: "123", owner: "TenwaysCom", repo: "Tenways", pullNumber: 1139,
          title: "Different branch", htmlUrl: "https://github.com/TenwaysCom/Tenways/pull/1139",
          headRef: "feature/m-123-extra", state: "open",
          isDraft: false,
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
            odooShBuilds: [],
          }),
          expect.objectContaining({ pullNumber: 1139, odooShBuilds: [] }),
        ],
      })],
    });
    expect(odooDevopsBranchesService.list).not.toHaveBeenCalled();
  });

  it("keeps linked Meegle details out of GitHub PR list rows", async () => {
    const store = {
      listGitHubPullRequests: vi.fn().mockResolvedValue([
        {
          owner: "TenwaysCom", repo: "tenways-ukk", pullNumber: 1138, title: "Exact branch",
          description: "PR description",
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
      countGitHubPullRequests: vi.fn().mockResolvedValue(2),
      listMeegleWorkitemsByIds: vi.fn(),
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

    const githubPullRequests = { statuses: ["open"], labels: ["bug"], offset: 50 };
    await expect(service.list("github-pull-requests", 50, { githubPullRequests })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          pullNumber: 1138,
          meegleIds: ["123"],
          odooShBuilds: [
            { environment: "uk", status: "done", result: "success" },
          ],
        }),
        expect.objectContaining({ pullNumber: 1139, meegleIds: [], odooShBuilds: [] }),
      ],
    });
    const result = await service.list("github-pull-requests", 50, { githubPullRequests });
    expect(result.items[0]).not.toHaveProperty("description");
    expect(result.items[0]).not.toHaveProperty("meegleWorkitems");
    expect(store.listGitHubPullRequests).toHaveBeenCalledWith(50, githubPullRequests);
    expect(store.countGitHubPullRequests).toHaveBeenCalledWith(githubPullRequests);
    expect(store.listMeegleWorkitemsByIds).not.toHaveBeenCalled();
    expect(odooDevopsBranchesService.list).toHaveBeenCalledWith("uk");
  });

  it("loads linked Meegle details only for the requested GitHub PR preview", async () => {
    const pullRequest = {
      owner: "TenwaysCom", repo: "tenways-ukk", pullNumber: 1138, title: "Exact branch",
      description: "PR description", state: "open", htmlUrl: "https://github.com/TenwaysCom/tenways-ukk/pull/1138",
      headRef: "feature/m-123", baseRef: "main", isDraft: false, meegleIds: ["123", "missing"],
      syncedAt: "2026-08-10T00:00:00.000Z",
    };
    const store = {
      findGitHubPullRequest: vi.fn().mockResolvedValue(pullRequest),
      listMeegleWorkitemsByIds: vi.fn().mockResolvedValue([{
        projectKey: "project", projectName: "Tenways", workItemTypeKey: "story", workItemId: "123",
        workItemKey: "M-123", title: "Linked story", workItemType: "Feature", status: "Doing",
        sprint: "Sprint 1", version: "Version 1", syncedAt: "2026-08-09T00:00:00.000Z",
      }]),
    } as unknown as PlatformSyncStore;
    const odooDevopsBranchesService = {
      list: vi.fn().mockResolvedValue({
        environment: "uk", project_name: "Odoo", total: 1,
        items: [{ branch: "feature/m-123", stage: "dev", last_build_status: "done", last_build_result: "success", odoo_branch: "17.0" }],
        cached: true,
      }),
    };
    const service = new PlatformDataService(store, odooDevopsBranchesService);

    await expect(service.getGitHubPullRequestPreview({ owner: "TenwaysCom", repo: "tenways-ukk", pullNumber: 1138 })).resolves.toMatchObject({
      description: "PR description",
      meegleIds: ["123", "missing"],
      meegleWorkitems: [{ workItemId: "123", title: "Linked story", status: "Doing", sprint: "Sprint 1", version: "Version 1" }],
      odooShBuilds: [{ environment: "uk", status: "done", result: "success" }],
    });
    expect(store.listMeegleWorkitemsByIds).toHaveBeenCalledWith(["123", "missing"]);
  });
});
