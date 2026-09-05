import { PostgresPlatformSyncCheckpointStore } from "./platform-sync-checkpoint-store.js";
import { createTestPostgresDatabase } from "./test-db.js";

describe("PostgresPlatformSyncCheckpointStore", () => {
  it("backfills one checkpoint per platform scope from historical snapshots", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncCheckpointStore(db);

    await db.insertInto("github_pr_syncs").values([
      githubSnapshot({ pull_number: 9, source_updated_at: "2026-08-09T10:00:00.000Z", synced_at: "2026-08-10T10:00:00.000Z" }),
      githubSnapshot({ pull_number: 12, source_updated_at: "2026-08-09T10:00:00.000Z", synced_at: "2026-08-11T10:00:00.000Z" }),
    ]).execute();
    await db.insertInto("lark_base_ticket_syncs").values(larkSnapshot({ source_updated_at: null })).execute();
    await db.insertInto("meegle_workitem_syncs").values([
      meegleSnapshot(),
      meegleSnapshot({ work_item_id: "43", source_updated_at: "2026-08-07 10:00:01" }),
    ]).execute();

    await expect(store.listInitialCheckpoints()).resolves.toEqual([
      {
        platform: "github",
        scopeKey: "acme/app",
        watermarkUpdatedAt: "2026-08-09T10:00:00.000Z",
        watermarkTiebreaker: "000000000012",
        lastSuccessAt: "2026-08-11T10:00:00.000Z",
      },
      {
        platform: "meegle",
        scopeKey: "project/story",
        watermarkUpdatedAt: "2026-08-07 10:00:01",
        watermarkTiebreaker: "story:43",
        lastSuccessAt: "2026-08-08T10:00:00.000Z",
      },
    ]);
  });

  it("backfills Meegle checkpoints independently for each work-item type", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncCheckpointStore(db);
    await db.insertInto("meegle_workitem_syncs").values([
      meegleSnapshot({ work_item_type_key: "story", work_item_id: "story-1", source_updated_at: "2026-08-08T10:00:00.000Z" }),
      meegleSnapshot({ work_item_type_key: "tech-task", work_item_id: "task-1", source_updated_at: "2026-08-09T10:00:00.000Z" }),
      meegleSnapshot({ work_item_type_key: "production-bug", work_item_id: "bug-1", source_updated_at: "2026-08-10T10:00:00.000Z" }),
    ]).execute();

    await expect(store.listInitialCheckpoints()).resolves.toEqual([
      expect.objectContaining({ platform: "meegle", scopeKey: "project/production-bug", watermarkTiebreaker: "production-bug:bug-1" }),
      expect.objectContaining({ platform: "meegle", scopeKey: "project/story", watermarkTiebreaker: "story:story-1" }),
      expect.objectContaining({ platform: "meegle", scopeKey: "project/tech-task", watermarkTiebreaker: "tech-task:task-1" }),
    ]);
  });

  it("creates only missing checkpoints so historical initialization is idempotent", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncCheckpointStore(db);
    const checkpoint = {
      platform: "github" as const,
      scopeKey: "acme/app",
      watermarkUpdatedAt: "2026-08-09T10:00:00.000Z",
      watermarkTiebreaker: "000000000012",
      lastSuccessAt: "2026-08-11T10:00:00.000Z",
    };

    await expect(store.createIfMissing(checkpoint, "2026-08-11T12:00:00.000Z")).resolves.toBe(true);
    await expect(store.createIfMissing(checkpoint, "2026-08-12T12:00:00.000Z")).resolves.toBe(false);
    await expect(db.selectFrom("platform_sync_checkpoints").selectAll().execute()).resolves.toEqual([{
      platform: "github",
      scope_key: "acme/app",
      watermark_updated_at: "2026-08-09T10:00:00.000Z",
      watermark_tiebreaker: "000000000012",
      last_success_at: "2026-08-11T10:00:00.000Z",
      last_error: null,
      version: 0,
      created_at: "2026-08-11T12:00:00.000Z",
      updated_at: "2026-08-11T12:00:00.000Z",
    }]);
  });

  it("reads and records the outcome of an incremental run", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncCheckpointStore(db);
    await store.createIfMissing({
      platform: "github",
      scopeKey: "acme/app",
      watermarkUpdatedAt: "2026-08-11T08:00:00.000Z",
      watermarkTiebreaker: "000000000001",
    }, "2026-08-11T09:00:00.000Z");

    await expect(store.get("github", "acme/app")).resolves.toEqual(expect.objectContaining({
      watermarkUpdatedAt: "2026-08-11T08:00:00.000Z",
    }));
    await store.markFailure("github", "acme/app", new Error("GitHub unavailable"), "2026-08-11T09:01:00.000Z");
    await store.markSuccess({
      platform: "github",
      scopeKey: "acme/app",
      watermarkUpdatedAt: "2026-08-11T08:02:00.000Z",
      watermarkTiebreaker: "000000000012",
    }, "2026-08-11T09:02:00.000Z");

    await expect(store.get("github", "acme/app")).resolves.toEqual({
      platform: "github",
      scopeKey: "acme/app",
      watermarkUpdatedAt: "2026-08-11T08:02:00.000Z",
      watermarkTiebreaker: "000000000012",
      lastSuccessAt: "2026-08-11T09:02:00.000Z",
      version: 1,
    });
  });

  it("initializes an existing checkpoint only when its watermark is missing", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncCheckpointStore(db);
    await store.createIfMissing({
      platform: "lark",
      scopeKey: "base/table",
      lastError: "Historical snapshot is missing source_updated_at",
    }, "2026-08-11T09:00:00.000Z");

    const checkpoint = {
      platform: "lark" as const,
      scopeKey: "base/table",
      watermarkUpdatedAt: "2026-08-06T12:50:56.000Z",
      watermarkTiebreaker: "rec_9",
      lastSuccessAt: "2026-08-07T01:48:09.505Z",
      version: 1,
    };
    await expect(store.initializeMissingWatermark(checkpoint, "2026-08-11T10:00:00.000Z")).resolves.toBe(true);
    await expect(store.initializeMissingWatermark(checkpoint, "2026-08-11T11:00:00.000Z")).resolves.toBe(false);
    await expect(store.get("lark", "base/table")).resolves.toEqual({
      platform: "lark",
      scopeKey: "base/table",
      watermarkUpdatedAt: "2026-08-06T12:50:56.000Z",
      watermarkTiebreaker: "rec_9",
      lastSuccessAt: "2026-08-07T01:48:09.505Z",
      lastError: undefined,
      version: 1,
    });
  });

  it("resets a Lark checkpoint without deriving a watermark from historical snapshots", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncCheckpointStore(db);
    await store.createIfMissing({
      platform: "lark",
      scopeKey: "base/table",
      watermarkUpdatedAt: "2026-08-01T00:00:00.000Z",
      watermarkTiebreaker: "rec_legacy",
    });

    await store.resetWatermark("lark", "base/table", "2026-08-11T09:55:00.000Z", "", "2026-08-11T10:00:00.000Z");

    await expect(store.get("lark", "base/table")).resolves.toEqual({
      platform: "lark",
      scopeKey: "base/table",
      watermarkUpdatedAt: "2026-08-11T09:55:00.000Z",
      watermarkTiebreaker: "",
      version: 1,
    });
  });
});

function githubSnapshot(overrides: Partial<{
  pull_number: number;
  source_updated_at: string | null;
  synced_at: string;
}> = {}) {
  return {
    owner: "acme",
    repo: "app",
    pull_number: 1,
    title: "PR",
    description: null,
    state: "closed",
    merged_at: null,
    html_url: "https://github.com/acme/app/pull/1",
    author_login: null,
    merged_by_login: null,
    head_ref: null,
    base_ref: null,
    is_draft: false,
    meegle_ids: "[]",
    reviewers_json: null,
    labels_json: null,
    created_at: null,
    payload_json: "{}",
    source_updated_at: "2026-08-08T10:00:00.000Z",
    synced_at: "2026-08-08T10:00:00.000Z",
    ...overrides,
  };
}

function larkSnapshot(overrides: Partial<{ source_updated_at: string | null }> = {}) {
  return {
    base_id: "base",
    table_id: "table",
    record_id: "rec_1",
    title: "Ticket",
    ticket_status: null,
    fields_json: "{}",
    shared_url: null,
    created_time: null,
    source_updated_at: "2026-08-08T10:00:00.000Z",
    synced_at: "2026-08-08T10:00:00.000Z",
    ticket_number: null,
    issue_type: null,
    requester: null,
    responsible: null,
    priority: null,
    detail_description: null,
    meegle_link: null,
    lark_message_link: null,
    ...overrides,
  };
}

function meegleSnapshot(overrides: Partial<{
  work_item_type_key: string;
  work_item_id: string;
  source_updated_at: string | null;
  synced_at: string;
}> = {}) {
  return {
    project_key: "project",
    project_name: null,
    work_item_type_key: "story",
    work_item_id: "42",
    work_item_key: null,
    title: "Story",
    work_item_type: null,
    status_key: null,
    status: null,
    sub_stage_key: null,
    sub_stage: null,
    sprint: null,
    version: null,
    system: null,
    bugs_json: null,
    assignee: null,
    payload_json: "{}",
    source_updated_at: "2026-08-07T10:00:00.000Z",
    synced_at: "2026-08-08T10:00:00.000Z",
    ...overrides,
  };
}
