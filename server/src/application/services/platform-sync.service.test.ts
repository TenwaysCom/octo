import type { GitHubPrDetails } from "../../adapters/github/github-types.js";
import type { LarkBitableRecord, LarkClient } from "../../adapters/lark/lark-client.js";
import type { MeegleClient, MeegleSyncMapping, MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import type { PlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { PlatformSyncService, isInactiveSyncStatus } from "./platform-sync.service.js";

function createStore(): PlatformSyncStore & {
  meegle: Array<{ workitem: MeegleWorkitem }>;
  meegleMappings: MeegleSyncMapping[];
  github: Array<{ pullRequest: GitHubPrDetails }>;
  lark: Array<{ record: LarkBitableRecord; title: string; status?: string }>;
} {
  const store = {
    meegle: [] as Array<{ workitem: MeegleWorkitem }>,
    meegleMappings: [] as MeegleSyncMapping[],
    github: [] as Array<{ pullRequest: GitHubPrDetails }>,
    lark: [] as Array<{ record: LarkBitableRecord; title: string; status?: string }>,
    async upsertMeegleWorkitem(input: { projectKey: string; workItemTypeKey: string; workitem: MeegleWorkitem }) {
      store.meegle.push({ workitem: input.workitem });
    },
    async upsertMeegleMappings(mappings: MeegleSyncMapping[]) {
      store.meegleMappings.push(...mappings);
    },
    async upsertGitHubPullRequest(input: { owner: string; repo: string; pullRequest: GitHubPrDetails }) {
      store.github.push({ pullRequest: input.pullRequest });
    },
    async upsertLarkBaseTicket(input: {
      baseId: string;
      tableId: string;
      record: LarkBitableRecord;
      title: string;
      status?: string;
    }) {
      store.lark.push({ record: input.record, title: input.title, status: input.status });
    },
    async listMeegleWorkitems() { return []; },
    async listMeegleSprints() { return []; },
    async listGitHubPullRequests() { return []; },
    async listLarkBaseTickets() { return []; },
  };
  return store;
}

function workitem(id: string, status: string): MeegleWorkitem {
  return { id, key: `WI-${id}`, name: `Item ${id}`, type: "story", status, fields: {} };
}

describe("PlatformSyncService", () => {
  it("allows a manual Meegle sync even when the item is finished", async () => {
    const store = createStore();
    const client = {
      getWorkitemDetails: vi.fn().mockResolvedValue([workitem("1", "Finished")]),
    } as unknown as MeegleClient;
    const service = new PlatformSyncService({
      store,
      createMeegleClient: async () => client,
    });

    await service.syncMeegleWorkitem({
      masterUserId: "user-1",
      projectKey: "project",
      workItemTypeKey: "story",
      workItemId: "1",
    });

    expect(store.meegle).toHaveLength(1);
    expect(store.meegle[0].workitem.status).toBe("Finished");
  });

  it("skips inactive Meegle items during a bulk sync", async () => {
    const store = createStore();
    const client = {
      filterWorkitems: vi.fn().mockResolvedValue([
        workitem("1", "In Progress"),
        workitem("2", "Cancelled"),
      ]),
      getWorkitemDetails: vi.fn().mockResolvedValue([workitem("1", "In Progress")]),
    } as unknown as MeegleClient;
    const service = new PlatformSyncService({
      store,
      createMeegleClient: async () => client,
    });

    await expect(service.bulkSyncMeegleWorkitems({
      masterUserId: "user-1",
      projectKey: "project",
    })).resolves.toEqual({ listed: 2, skippedInactive: 1, synced: 1 });
    expect(store.meegle).toHaveLength(1);
  });

  it("synchronizes mappings before storing converted Meegle fields", async () => {
    const store = createStore();
    const client = {
      filterWorkitems: vi.fn().mockResolvedValue([{
        id: "1",
        key: "",
        name: "Bug",
        type: "production_bug",
        status: "New",
        statusKey: "status_new",
        fields: {},
      }]),
      getWorkitemDetails: vi.fn().mockResolvedValue([{
        id: "1",
        key: "",
        name: "Bug",
        type: "production_bug",
        workItemType: "Production Bug",
        status: "New",
        statusKey: "status_new",
        subStage: "Triage",
        subStageKey: "node_triage",
        fields: {},
      }]),
      getSyncMappings: vi.fn().mockResolvedValue([{
        projectKey: "project",
        workItemTypeKey: "production_bug",
        kind: "workitem_type",
        sourceKey: "production_bug",
        displayValue: "Production Bug",
      }, {
        projectKey: "project",
        workItemTypeKey: "production_bug",
        kind: "status",
        sourceKey: "status_new",
        displayValue: "New",
      }]),
    } as unknown as MeegleClient;
    const service = new PlatformSyncService({
      store,
      createMeegleClient: async () => client,
    });

    await service.bulkSyncMeegleWorkitems({
      masterUserId: "user-1",
      projectKey: "project",
      workItemTypeKeys: ["production_bug"],
    });

    expect(store.meegleMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "workitem_type", sourceKey: "production_bug", displayValue: "Production Bug" }),
      expect.objectContaining({ kind: "status", sourceKey: "status_new", displayValue: "New" }),
      expect.objectContaining({ kind: "sub_stage", sourceKey: "node_triage", displayValue: "Triage" }),
    ]));
    expect(store.meegle[0].workitem).toMatchObject({
      workItemType: "Production Bug",
      status: "New",
      statusKey: "status_new",
      subStage: "Triage",
      subStageKey: "node_triage",
    });
  });

  it("syncs only open GitHub PRs and preserves their detailed snapshot", async () => {
    const store = createStore();
    const pullRequest = {
      number: 12,
      title: "Active PR",
      body: "details",
      html_url: "https://github.com/acme/app/pull/12",
      state: "open",
      merged_at: null,
      updated_at: "2026-08-06T00:00:00Z",
      draft: false,
    } as GitHubPrDetails;
    const client = {
      listOpenPullRequests: vi.fn().mockResolvedValue([pullRequest]),
      getPullRequest: vi.fn().mockResolvedValue(pullRequest),
    } as unknown as import("../../adapters/github/github-client.js").GitHubClient;
    const service = new PlatformSyncService({ store, createGitHubClient: () => client });

    await expect(service.bulkSyncGitHubPullRequests({
      repositories: [{ owner: "acme", repo: "app" }],
    })).resolves.toEqual({ listed: 1, skippedInactive: 0, synced: 1 });
    expect(store.github).toHaveLength(1);
    expect(client.getPullRequest).toHaveBeenCalledWith("acme", "app", 12);
  });

  it("paginates Lark tickets and skips closed records based on the configured status field", async () => {
    const store = createStore();
    const openRecord: LarkBitableRecord = {
      record_id: "rec-open",
      fields: { Ticket: "Open ticket", Status: "In Progress" },
    };
    const closedRecord: LarkBitableRecord = {
      record_id: "rec-closed",
      fields: { Ticket: "Closed ticket", Status: "Closed" },
    };
    const client = {
      listRecords: vi.fn()
        .mockResolvedValueOnce({ records: [openRecord], hasMore: true, nextPageToken: "next" })
        .mockResolvedValueOnce({ records: [closedRecord], hasMore: false }),
    } as unknown as LarkClient;
    const service = new PlatformSyncService({
      store,
      createLarkClient: async () => client,
    });

    await expect(service.bulkSyncLarkBaseTickets({
      masterUserId: "user-1",
      baseId: "base",
      tableId: "table",
      titleFieldName: "Ticket",
      statusFieldName: "Status",
    })).resolves.toEqual({ listed: 2, skippedInactive: 1, synced: 1 });
    expect(store.lark).toEqual([{ record: openRecord, title: "Open ticket", status: "In Progress" }]);
    expect(client.listRecords).toHaveBeenNthCalledWith(2, "base", "table", { pageSize: 100, pageToken: "next" });
  });

  it("recognizes the requested terminal statuses", () => {
    expect(isInactiveSyncStatus("terminated")).toBe(true);
    expect(isInactiveSyncStatus("cancelled")).toBe(true);
    expect(isInactiveSyncStatus("finish")).toBe(true);
    expect(isInactiveSyncStatus("finished")).toBe(true);
    expect(isInactiveSyncStatus("rejected")).toBe(true);
    expect(isInactiveSyncStatus("merged")).toBe(true);
    expect(isInactiveSyncStatus("closed")).toBe(true);
    expect(isInactiveSyncStatus("end")).toBe(true);
    expect(isInactiveSyncStatus("in progress")).toBe(false);
  });
});
