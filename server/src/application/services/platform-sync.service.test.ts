import type { GitHubPrDetails } from "../../adapters/github/github-types.js";
import type { LarkBitableRecord, LarkClient } from "../../adapters/lark/lark-client.js";
import type { MeegleClient, MeegleSyncMapping, MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import type { PlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { buildLarkUpdatedSinceFilter, PlatformSyncService, isInactiveSyncStatus } from "./platform-sync.service.js";

function createStore(): PlatformSyncStore & {
  meegle: Array<{ workitem: MeegleWorkitem }>;
  meegleMappings: MeegleSyncMapping[];
  github: Array<{ pullRequest: GitHubPrDetails }>;
  lark: Array<{ record: LarkBitableRecord; title: string; status?: string }>;
  cleanedMeegle: string[];
  cleanedGitHub: string[];
  githubCleaning: Array<{ pullNumber: number; mergedBy?: string; reviewers: string[]; labels: string[]; createdAt?: string }>;
  cleanedLark: string[];
  larkCleaning: Array<{ recordId: string; detailDescription?: string; meegleLink?: string; larkMessageLink?: string }>;
} {
  const store = {
    meegle: [] as Array<{ workitem: MeegleWorkitem }>,
    meegleMappings: [] as MeegleSyncMapping[],
    github: [] as Array<{ pullRequest: GitHubPrDetails }>,
    lark: [] as Array<{ record: LarkBitableRecord; title: string; status?: string }>,
    cleanedMeegle: [] as string[],
    cleanedGitHub: [] as string[],
    githubCleaning: [] as Array<{ pullNumber: number; mergedBy?: string; reviewers: string[]; labels: string[]; createdAt?: string }>,
    cleanedLark: [] as string[],
    larkCleaning: [] as Array<{ recordId: string; detailDescription?: string; meegleLink?: string; larkMessageLink?: string }>,
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
    async upsertLarkBaseTickets(inputs: Array<{
      record: LarkBitableRecord;
      title: string;
      status?: string;
    }>) {
      store.lark.push(...inputs.map((input) => ({
        record: input.record,
        title: input.title,
        status: input.status,
      })));
    },
    async setLarkBaseTicketSharedUrl() {},
    async upsertLarkBaseTicketAi() { return false; },
    async findLarkBaseTicketByRecordId() { return undefined; },
    async getMeegleWorkitemsForCleaning(refs: Array<{ workItemId: string }>) {
      return store.meegle
        .filter(({ workitem }) => refs.some((ref) => ref.workItemId === workitem.id))
        .map(({ workitem }) => ({
          projectKey: "project", workItemTypeKey: workitem.type, workItemId: workitem.id,
          title: workitem.name, workItemType: workitem.workItemType, status: workitem.status,
          subStage: workitem.subStage, assignee: workitem.assignee, syncedAt: "2026-08-11T00:00:00Z",
        }));
    },
    async getGitHubPullRequestsForCleaning(refs: Array<{ pullNumber: number }>) {
      return store.github
        .filter(({ pullRequest }) => refs.some((ref) => ref.pullNumber === pullRequest.number))
        .map(({ pullRequest }) => ({
          owner: "acme", repo: "app", pullNumber: pullRequest.number, title: pullRequest.title,
          state: pullRequest.state, htmlUrl: pullRequest.html_url, isDraft: pullRequest.draft ?? false,
          meegleIds: [], sourcePayload: pullRequest, syncedAt: "2026-08-11T00:00:00Z",
        }));
    },
    async getLarkBaseTicketsForCleaning(refs: Array<{ recordId: string }>) {
      return store.lark
        .filter(({ record }) => refs.some((ref) => ref.recordId === record.record_id))
        .map(({ record, title, status }) => ({
          baseId: "base", tableId: "table", recordId: record.record_id, title,
          ticketStatus: status, createdTime: record.created_time, sourceFields: record.fields,
          syncedAt: "2026-08-11T00:00:00Z",
        }));
    },
    async applyMeegleWorkitemCleaning(input: { workItemId: string }) {
      store.cleanedMeegle.push(input.workItemId);
      return true;
    },
    async applyGitHubPullRequestCleaning(input: { pullNumber: number; mergedBy?: string; reviewers: string[]; labels: string[]; createdAt?: string }) {
      store.cleanedGitHub.push(String(input.pullNumber));
      store.githubCleaning.push(input);
      return true;
    },
    async applyLarkBaseTicketCleaning(input: { recordId: string; detailDescription?: string; meegleLink?: string; larkMessageLink?: string }) {
      store.cleanedLark.push(input.recordId);
      store.larkCleaning.push(input);
      return true;
    },
    async applyLarkBaseTicketCleanings(inputs: Array<{ recordId: string; detailDescription?: string; meegleLink?: string; larkMessageLink?: string }>) {
      store.cleanedLark.push(...inputs.map((input) => input.recordId));
      store.larkCleaning.push(...inputs);
      return inputs.length;
    },
    async listMeegleWorkitems() { return []; },
    async countMeegleWorkitems() { return 0; },
    async listMeegleSprints() { return []; },
    async listGitHubPullRequestLinks() { return []; },
    async listGitHubPullRequests() { return []; },
    async countGitHubPullRequests() { return 0; },
    async listLarkBaseTickets() { return []; },
    async countLarkBaseTickets() { return 0; },
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

  it("cleans Meegle snapshots into the Octo projection only when requested", async () => {
    const store = createStore();
    const client = {
      getWorkitemDetails: vi.fn().mockResolvedValue([workitem("1", "In Progress")]),
    } as unknown as MeegleClient;
    const service = new PlatformSyncService({ store, createMeegleClient: async () => client });

    await expect(service.syncMeegleWorkitem({
      masterUserId: "user-1",
      projectKey: "project",
      workItemTypeKey: "story",
      workItemId: "1",
      cleanAfterSync: true,
    })).resolves.toMatchObject({ synced: 1, cleaned: 1 });
    expect(store.cleanedMeegle).toEqual(["1"]);
  });

  it("cleans later snapshot objects after a cleaning failure, then reports the failed references", async () => {
    const store = createStore();
    store.meegle.push({ workitem: workitem("1", "In Progress") }, { workitem: workitem("2", "In Progress") });
    store.github.push({ pullRequest: {
      number: 1, title: "First", html_url: "https://github.com/acme/app/pull/1", state: "open", merged_at: null, draft: false,
    } as GitHubPrDetails }, { pullRequest: {
      number: 2, title: "Second", html_url: "https://github.com/acme/app/pull/2", state: "open", merged_at: null, draft: false,
    } as GitHubPrDetails });
    store.lark.push({ record: { record_id: "rec-1", fields: {} }, title: "First" }, { record: { record_id: "rec-2", fields: {} }, title: "Second" });
    vi.spyOn(store, "applyMeegleWorkitemCleaning").mockImplementation(async ({ workItemId }) => {
      if (workItemId === "1") throw new Error("Meegle cleaning failed");
      store.cleanedMeegle.push(workItemId);
      return true;
    });
    vi.spyOn(store, "applyGitHubPullRequestCleaning").mockImplementation(async ({ pullNumber }) => {
      if (pullNumber === 1) throw new Error("GitHub cleaning failed");
      store.cleanedGitHub.push(String(pullNumber));
      return true;
    });
    const larkCleaning = vi.spyOn(store, "applyLarkBaseTicketCleanings")
      .mockRejectedValue(new Error("Lark batch cleaning failed"));
    const service = new PlatformSyncService({ store });

    await expect(service.cleanMeegleWorkitems([
      { projectKey: "project", workItemTypeKey: "story", workItemId: "1" },
      { projectKey: "project", workItemTypeKey: "story", workItemId: "2" },
    ])).rejects.toThrow("PLATFORM_SYNC_CLEANING_FAILED:meegle:1/2");
    await expect(service.cleanGitHubPullRequests([
      { owner: "acme", repo: "app", pullNumber: 1 },
      { owner: "acme", repo: "app", pullNumber: 2 },
    ])).rejects.toThrow("PLATFORM_SYNC_CLEANING_FAILED:github:1/2");
    await expect(service.cleanLarkBaseTickets([
      { baseId: "base", tableId: "table", recordId: "rec-1" },
      { baseId: "base", tableId: "table", recordId: "rec-2" },
    ])).rejects.toThrow("PLATFORM_SYNC_CLEANING_FAILED:lark:2");
    expect(store.cleanedMeegle).toEqual(["2"]);
    expect(store.cleanedGitHub).toEqual(["2"]);
    expect(larkCleaning).toHaveBeenCalledWith([
      expect.objectContaining({ recordId: "rec-1" }),
      expect.objectContaining({ recordId: "rec-2" }),
    ]);
  });

  it("does not write Ticket AI fields back during a Lark snapshot sync", async () => {
    const store = createStore();
    const record: LarkBitableRecord = {
      record_id: "rec-1",
      fields: { Title: "Ticket", "AI分析状态": "已分析" },
    };
    const client = {
      listRecords: vi.fn().mockResolvedValue({ records: [record], hasMore: false }),
      batchGetRecords: vi.fn(),
      updateRecord: vi.fn().mockResolvedValue({ record_id: "rec-1", fields: { "AI分析状态": "已分析" } }),
    } as unknown as LarkClient;
    const service = new PlatformSyncService({ store, createLarkClient: async () => client });

    await expect(service.bulkSyncLarkBaseTickets({
      masterUserId: "user-1", baseId: "base", tableId: "table",
    })).resolves.toMatchObject({ listed: 1, synced: 1 });
    expect(store.lark).toHaveLength(1);
    expect(client.batchGetRecords).not.toHaveBeenCalled();
    expect(client.updateRecord).not.toHaveBeenCalled();
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

  it("uses MQL source-time candidates then batch details to sync Meegle incrementally", async () => {
    const store = createStore();
    const candidate = {
      ...workitem("1", "Finished"),
      updatedAt: "2026-08-11T00:01:00.000Z",
    };
    const detailed = { ...candidate, updatedAt: undefined };
    const client = {
      filterWorkitems: vi.fn().mockResolvedValue([candidate]),
      getWorkitemDetails: vi.fn().mockResolvedValue([detailed]),
      getSyncMappings: vi.fn().mockResolvedValue([]),
    } as unknown as MeegleClient;
    const service = new PlatformSyncService({ store, createMeegleClient: async () => client });

    await expect(service.incrementalSyncMeegleWorkitems({
      masterUserId: "user-1",
      projectKey: "project",
      workItemTypeKeys: ["story"],
      sourceUpdatedAtMqlFieldNames: { story: "updated_at" },
      watermarkUpdatedAt: "2026-08-11T00:00:00.000Z",
      watermarkTiebreaker: "story:0",
    })).resolves.toMatchObject({
      listed: 1,
      synced: 1,
      watermarkUpdatedAt: "2026-08-11T00:01:00.000Z",
    });

    expect(client.filterWorkitems).toHaveBeenCalledWith("project", {
      workitemTypeKeys: ["story"],
      pageSize: 50,
      autoPaginate: true,
      sourceUpdatedAfter: "2026-08-10T23:55:00.000Z",
      sourceUpdatedAtMqlFieldNames: { story: "updated_at" },
    });
    expect(client.getWorkitemDetails).toHaveBeenCalledWith("project", "story", ["1"], [
      "field_feb079",
      "field_1b9eb0",
      "field_00f541",
      "field_9edc03",
    ]);
    expect(store.meegle).toHaveLength(1);
  });

  it("requests Tech Task relation fields before cleaning incremental snapshots", async () => {
    const store = createStore();
    const techTaskType = "66700acbf297a8f821b4b860";
    const candidate = {
      ...workitem("tech-1", "In Progress"),
      type: techTaskType,
      updatedAt: "2026-08-11T00:01:00.000Z",
    };
    const client = {
      filterWorkitems: vi.fn().mockResolvedValue([candidate]),
      getWorkitemDetails: vi.fn().mockResolvedValue([{
        ...candidate,
        fields: {
          work_item_fields: [
            { key: "field_ecd063", value: { name: "Sprint 1" } },
            { key: "field_5fab52", value: { name: "Version 1" } },
          ],
        },
      }]),
      getSyncMappings: vi.fn().mockResolvedValue([]),
    } as unknown as MeegleClient;
    const service = new PlatformSyncService({ store, createMeegleClient: async () => client });

    await service.incrementalSyncMeegleWorkitems({
      masterUserId: "user-1",
      projectKey: "project",
      workItemTypeKeys: [techTaskType],
      sourceUpdatedAtMqlFieldNames: { [techTaskType]: "updated_at" },
      watermarkUpdatedAt: "2026-08-11T00:00:00.000Z",
      watermarkTiebreaker: `${techTaskType}:0`,
      cleanAfterSync: true,
    });

    expect(client.getWorkitemDetails).toHaveBeenCalledWith("project", techTaskType, ["tech-1"], [
      "field_ecd063",
      "field_5fab52",
      "field_3daed9",
    ]);
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

  it("syncs changed GitHub PRs incrementally, including terminal states", async () => {
    const store = createStore();
    const pullRequest = {
      number: 12,
      title: "Merged PR",
      body: "details",
      html_url: "https://github.com/acme/app/pull/12",
      state: "closed",
      merged_at: "2026-08-12T00:01:00Z",
      updated_at: "2026-08-12T00:01:00Z",
      draft: false,
    } as GitHubPrDetails;
    const client = {
      listPullRequestsUpdatedSince: vi.fn().mockResolvedValue([{ number: 12, updated_at: pullRequest.updated_at }]),
      getPullRequest: vi.fn().mockResolvedValue(pullRequest),
    } as unknown as import("../../adapters/github/github-client.js").GitHubClient;
    const service = new PlatformSyncService({ store, createGitHubClient: () => client });

    await expect(service.incrementalSyncGitHubPullRequests({
      owner: "acme",
      repo: "app",
      watermarkUpdatedAt: "2026-08-12T00:00:00Z",
      watermarkTiebreaker: "000000000001",
      cleanAfterSync: true,
    })).resolves.toMatchObject({
      listed: 1,
      synced: 1,
      cleaned: 1,
      watermarkUpdatedAt: "2026-08-12T00:01:00Z",
      watermarkTiebreaker: "000000000012",
    });
    expect(client.listPullRequestsUpdatedSince).toHaveBeenCalledWith("acme", "app", "2026-08-11T23:55:00.000Z");
    expect(store.github).toHaveLength(1);
  });

  it("cleans GitHub author, merger, requested reviewers, labels, and creation time into its Octo projection", async () => {
    const store = createStore();
    const pullRequest = {
      number: 34,
      title: "Clean PR metadata",
      body: null,
      html_url: "https://github.com/acme/app/pull/34",
      state: "closed",
      merged_at: "2026-08-10T07:00:00Z",
      created_at: "2026-08-01T08:00:00Z",
      updated_at: "2026-08-10T08:00:00Z",
      draft: false,
      user: { login: "author" },
      merged_by: { login: "merger" },
      requested_reviewers: [{ login: "reviewer-a" }, { login: "reviewer-b" }, { login: "reviewer-a" }],
      labels: [{ name: "bug" }, { name: "P1" }, { name: "bug" }],
    } as GitHubPrDetails;
    const client = { getPullRequest: vi.fn().mockResolvedValue(pullRequest) } as unknown as import("../../adapters/github/github-client.js").GitHubClient;
    const service = new PlatformSyncService({ store, createGitHubClient: () => client });

    await expect(service.syncGitHubPullRequest({
      owner: "acme",
      repo: "app",
      pullNumber: 34,
      cleanAfterSync: true,
    })).resolves.toMatchObject({ synced: 1, cleaned: 1 });

    expect(store.githubCleaning[0]).toMatchObject({
      mergedBy: "merger",
      reviewers: ["reviewer-a", "reviewer-b"],
      labels: ["bug", "P1"],
      createdAt: "2026-08-01T08:00:00Z",
    });
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
      batchGetRecords: vi.fn(),
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
    expect(client.listRecords).toHaveBeenNthCalledWith(1, "base", "table", {
      pageSize: 100,
      pageToken: undefined,
      automaticFields: true,
    });
    expect(client.listRecords).toHaveBeenNthCalledWith(2, "base", "table", {
      pageSize: 100,
      pageToken: "next",
      automaticFields: true,
    });
    expect(client.batchGetRecords).not.toHaveBeenCalled();
  });

  it("uses Issue Description as the Lark ticket title when no explicit title field is configured", async () => {
    const store = createStore();
    const record: LarkBitableRecord = {
      record_id: "rec-issue-description",
      fields: { "Issue Description": "Actual ticket title", 状态: "In Progress" },
    };
    const client = {
      batchGetRecords: vi.fn().mockResolvedValue({ records: [record], forbidden_record_ids: [], absent_record_ids: [] }),
    } as unknown as LarkClient;
    const service = new PlatformSyncService({ store, createLarkClient: async () => client });

    await service.syncLarkBaseTicket({
      masterUserId: "user-1", baseId: "base", tableId: "table", recordId: record.record_id,
    });

    expect(store.lark).toEqual([{ record, title: "Actual ticket title", status: "In Progress" }]);
  });

  it("retrieves Lark incremental candidates with a source-side last-modified filter", async () => {
    const store = createStore();
    const record: LarkBitableRecord = {
      record_id: "rec-changed",
      fields: { Ticket: "Changed ticket" },
      updated_time: "2026-08-11T00:01:00.000Z",
    };
    const laterRecord: LarkBitableRecord = {
      record_id: "rec-later",
      fields: { Ticket: "Later ticket" },
      updated_time: "2026-08-11T00:02:00.000Z",
    };
    const client = {
      listRecords: vi.fn()
        .mockResolvedValueOnce({ records: [record], hasMore: true, nextPageToken: "next" })
        .mockResolvedValueOnce({ records: [laterRecord], hasMore: false }),
      batchGetRecords: vi.fn(),
    } as unknown as LarkClient;
    const service = new PlatformSyncService({ store, createLarkClient: async () => client });

    await expect(service.incrementalSyncLarkBaseTickets({
      masterUserId: "user-1",
      baseId: "base",
      tableId: "table",
      titleFieldName: "Ticket",
      sourceUpdatedAtFieldName: "最后更新时间",
      watermarkUpdatedAt: "2026-08-11T00:00:00.000Z",
      watermarkTiebreaker: "rec-previous",
    })).resolves.toMatchObject({
      listed: 2,
      synced: 2,
      watermarkUpdatedAt: "2026-08-11T00:02:00.000Z",
      watermarkTiebreaker: "rec-later",
    });

    expect(client.listRecords).toHaveBeenNthCalledWith(1, "base", "table", {
      pageSize: 100,
      pageToken: undefined,
      filter: 'CurrentValue.[最后更新时间] >= TODATE("2026-08-10T23:55:00.000Z")',
      automaticFields: true,
    });
    expect(client.listRecords).toHaveBeenNthCalledWith(2, "base", "table", {
      pageSize: 100,
      pageToken: "next",
      filter: 'CurrentValue.[最后更新时间] >= TODATE("2026-08-10T23:55:00.000Z")',
      automaticFields: true,
    });
    expect(client.batchGetRecords).not.toHaveBeenCalled();
    expect(store.lark).toEqual([
      { record, title: "Changed ticket", status: undefined },
      { record: laterRecord, title: "Later ticket", status: undefined },
    ]);
  });

  it("fails Lark incremental sync when a List record is missing updated_time", async () => {
    const store = createStore();
    const client = {
      listRecords: vi.fn().mockResolvedValue({
        records: [{ record_id: "rec-missing-time", fields: { Ticket: "Missing time" } }],
        hasMore: false,
      }),
      batchGetRecords: vi.fn(),
    } as unknown as LarkClient;
    const service = new PlatformSyncService({ store, createLarkClient: async () => client });

    await expect(service.incrementalSyncLarkBaseTickets({
      masterUserId: "user-1",
      baseId: "base",
      tableId: "table",
      sourceUpdatedAtFieldName: "最后更新时间",
      watermarkUpdatedAt: "2026-08-11T00:00:00.000Z",
      watermarkTiebreaker: "rec-previous",
    })).rejects.toThrow("Lark incremental list record is missing updated_time");

    expect(client.batchGetRecords).not.toHaveBeenCalled();
    expect(store.lark).toEqual([]);
  });

  it("fetches selected Lark tickets in batches of 100 and writes one snapshot batch", async () => {
    const store = createStore();
    const records = Array.from({ length: 101 }, (_, index): LarkBitableRecord => ({
      record_id: `rec-${index + 1}`,
      fields: { Title: `Ticket ${index + 1}` },
    }));
    const client = {
      batchGetRecords: vi.fn()
        .mockResolvedValueOnce({ records: records.slice(0, 100), forbidden_record_ids: [], absent_record_ids: [] })
        .mockResolvedValueOnce({ records: records.slice(100), forbidden_record_ids: [], absent_record_ids: [] }),
    } as unknown as LarkClient;
    const upsertBatch = vi.spyOn(store, "upsertLarkBaseTickets");
    const service = new PlatformSyncService({ store, createLarkClient: async () => client });

    await expect(service.selectedSyncLarkBaseTickets({
      masterUserId: "user-1",
      baseId: "base",
      tableId: "table",
      recordIds: records.map((record) => record.record_id),
    })).resolves.toEqual({ selected: 101, synced: 101 });

    expect(client.batchGetRecords).toHaveBeenCalledTimes(2);
    expect(client.batchGetRecords).toHaveBeenNthCalledWith(
      1,
      "base",
      "table",
      records.slice(0, 100).map((record) => record.record_id),
      { automaticFields: true },
    );
    expect(client.batchGetRecords).toHaveBeenNthCalledWith(
      2,
      "base",
      "table",
      ["rec-101"],
      { automaticFields: true },
    );
    expect(upsertBatch).toHaveBeenCalledTimes(1);
    expect(store.lark).toHaveLength(101);
  });

  it("fails a Lark batch before writing snapshots when records are incomplete", async () => {
    const store = createStore();
    const client = {
      batchGetRecords: vi.fn().mockResolvedValue({
        records: [{ record_id: "rec-1", fields: { Title: "One" } }],
        forbidden_record_ids: ["rec-2"],
        absent_record_ids: [],
      }),
    } as unknown as LarkClient;
    const service = new PlatformSyncService({ store, createLarkClient: async () => client });

    await expect(service.selectedSyncLarkBaseTickets({
      masterUserId: "user-1",
      baseId: "base",
      tableId: "table",
      recordIds: ["rec-1", "rec-2"],
    })).rejects.toThrow("LARK_BATCH_GET_INCOMPLETE:requested=2:forbidden=1:absent=0:missing=1");
    expect(store.lark).toEqual([]);
  });

  it("builds a Lark date filter with a configured source updated-at field", () => {
    expect(buildLarkUpdatedSinceFilter("最后更新时间", Date.parse("2026-08-11T00:00:00.000Z")))
      .toBe('CurrentValue.[最后更新时间] >= TODATE("2026-08-11T00:00:00.000Z")');
  });

  it("cleans the requested Lark ticket fields into its Octo projection", async () => {
    const store = createStore();
    const record: LarkBitableRecord = {
      record_id: "rec-1",
      created_time: "2026-08-01T08:00:00Z",
      fields: {
        Ticket: "Sync title",
        Status: "Open",
        "Ticket 编号": "SUP-101",
        "Issue 类型": [{ text: "Production Bug" }],
        需求人: [{ name: "PM Ada" }],
        负责人: [{ name: "Ada" }, { name: "Lin" }],
        优先级: { text: "P0" },
        紧急度: { text: "P1" },
        "Details Description": "Investigate https://applink.larksuite.com/client/thread/open?threadid=thread_1&chatid=chat_1",
        meegle链接: { url: "https://project.meegle.com/acme/story/detail/123" },
      },
    };
    const client = {
      batchGetRecords: vi.fn().mockResolvedValue({ records: [record], forbidden_record_ids: [], absent_record_ids: [] }),
    } as unknown as LarkClient;
    const service = new PlatformSyncService({ store, createLarkClient: async () => client });

    await expect(service.syncLarkBaseTicket({
      masterUserId: "user-1",
      baseId: "base",
      tableId: "table",
      recordId: "rec-1",
      titleFieldName: "Ticket",
      statusFieldName: "Status",
      cleanAfterSync: true,
    })).resolves.toMatchObject({ synced: 1, cleaned: 1 });

    expect(store.larkCleaning[0]).toMatchObject({
      ticketNumber: "SUP-101",
      issueType: "Production Bug",
      requester: "PM Ada",
      responsible: "Ada, Lin",
      priority: "P1",
      createdAt: "2026-08-01T08:00:00Z",
      detailDescription: expect.stringContaining("threadid=thread_1"),
      meegleLink: "https://project.meegle.com/acme/story/detail/123",
      larkMessageLink: expect.stringContaining("threadid=thread_1"),
    });
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
