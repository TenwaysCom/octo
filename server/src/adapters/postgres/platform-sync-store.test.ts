import { createTestPostgresDatabase } from "./test-db.js";
import { extractMeegleIds, PostgresPlatformSyncStore } from "./platform-sync-store.js";

describe("PostgresPlatformSyncStore", () => {
  it("extracts unique m- and f- Meegle IDs from a PR title and description", () => {
    expect(extractMeegleIds(
      "M-123 implements F-456",
      "Follow-up: m-123, f-789. Ignore m-not-an-id and f-12x.",
    )).toEqual(["123", "456", "789"]);
  });

  it("upserts independent Meegle, GitHub and Lark snapshots", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);

    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem: {
        id: "1", key: "S-1", name: "Original", type: "story", workItemType: "Feature",
        status: "In Progress", statusKey: "status_started", subStage: "Development", subStageKey: "node_dev", priority: "P1", updatedAt: "2026-08-01T00:00:00.000Z", fields: {},
      },
    });
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem: {
        id: "1", key: "S-1", name: "Updated", type: "story", workItemType: "Feature",
        status: "Finished", statusKey: "status_finished", subStage: "Done", subStageKey: "node_done", priority: "P0", updatedAt: "2026-08-02T00:00:00.000Z", fields: {},
      },
    });
    await store.upsertMeegleMappings([{
      projectKey: "project",
      workItemTypeKey: "story",
      kind: "workitem_type",
      sourceKey: "story",
      displayValue: "Feature",
    }]);
    await store.upsertGitHubPullRequest({
      owner: "acme",
      repo: "app",
      pullRequest: {
        number: 2,
        title: "PR m-123 f-456",
        body: "PR description m-123 and f-789",
        html_url: "https://github.com/acme/app/pull/2",
        state: "open",
        merged_at: null,
        updated_at: "2026-08-06T00:00:00.000Z",
        draft: false,
        head: { ref: "feature/m-123" },
        base: { ref: "main" },
      },
    });
    await store.upsertLarkBaseTicket({
      baseId: "base",
      tableId: "table",
      record: {
        record_id: "rec-1",
        fields: { Title: "Ticket" },
        shared_url: "https://example.larksuite.com/base/base?table=table&record=rec-1",
      },
      title: "Ticket",
      status: "Open",
    });
    await store.upsertLarkBaseTicket({
      baseId: "base",
      tableId: "table",
      record: { record_id: "rec-1", fields: { Title: "Ticket" } },
      title: "Ticket",
      status: "Open",
    });
    await db.updateTable("meegle_workitem_syncs").set({
      sprint: "Sprint 1",
      version: "Version 1",
      bugs_json: JSON.stringify(["Bug 1"]),
    }).where("work_item_id", "=", "1").execute();
    await store.applyLarkBaseTicketCleaning({
      baseId: "base",
      tableId: "table",
      recordId: "rec-1",
      requester: "PM Ada",
      priority: "P1",
    });
    await store.upsertLarkBaseTicketAi({
      baseId: "base", tableId: "table", recordId: "rec-1",
      fields: { "AI分析状态": "已分析", "Issue Description": "must not persist" },
    });

    await expect(db.selectFrom("meegle_workitem_syncs").selectAll().execute())
      .resolves.toEqual([expect.objectContaining({
        title: "Updated",
        work_item_type: "Feature",
        status_key: "status_finished",
        status: "Finished",
        sub_stage_key: "node_done",
        sub_stage: "Done",
        source_updated_at: "2026-08-02T00:00:00.000Z",
      })]);
    await expect(db.selectFrom("meegle_sync_mappings").selectAll().execute())
      .resolves.toEqual([expect.objectContaining({ source_key: "story", display_value: "Feature" })]);
    await expect(db.selectFrom("github_pr_syncs").selectAll().execute())
      .resolves.toEqual([expect.objectContaining({
        pull_number: 2,
        description: "PR description m-123 and f-789",
        meegle_ids: JSON.stringify(["123", "456", "789"]),
        state: "open",
      })]);
    await expect(db.selectFrom("lark_base_ticket_syncs").selectAll().execute())
      .resolves.toEqual([expect.objectContaining({ record_id: "rec-1", ticket_status: "Open" })]);

    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([expect.objectContaining({
      workItemId: "1", title: "Updated", statusKey: "status_finished", status: "Finished",
      subStageKey: "node_done", subStage: "Done",
      sprint: "Sprint 1", version: "Version 1", bugs: ["Bug 1"], priority: "P0",
    })]);
    await expect(store.listMeegleWorkitems(10, "Sprint 1")).resolves.toHaveLength(1);
    await expect(store.listMeegleWorkitems(10, "Sprint 2")).resolves.toEqual([]);
    await expect(store.listMeegleSprints()).resolves.toEqual(["Sprint 1"]);
    await expect(store.listGitHubPullRequests(10)).resolves.toEqual([expect.objectContaining({
      pullNumber: 2, title: "PR m-123 f-456", state: "open",
      meegleIds: ["123", "456", "789"],
    })]);
    await expect(store.listGitHubPullRequestLinks(["123", "456"])) .resolves.toEqual([
      expect.objectContaining({ meegleId: "123", pullNumber: 2, headRef: "feature/m-123", baseRef: "main", state: "open" }),
      expect.objectContaining({ meegleId: "456", pullNumber: 2, headRef: "feature/m-123", baseRef: "main", state: "open" }),
    ]);
    await expect(store.listLarkBaseTickets(10)).resolves.toEqual([expect.objectContaining({
      recordId: "rec-1", ticketStatus: "Open", requester: "PM Ada", priority: "P1",
      sharedUrl: "https://example.larksuite.com/base/base?table=table&record=rec-1",
      ticketAi: expect.objectContaining({ fields: { "AI分析状态": "已分析" } }),
    })]);
    await expect(store.findLarkBaseTicketByRecordId("rec-1")).resolves.toEqual({ baseId: "base", tableId: "table", recordId: "rec-1" });

    await db.destroy();
    await pool.end();
  });

  it("filters Lark Ticket snapshots by created time, source update time, and issue type before applying the limit", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    const records = [
      { recordId: "rec-feature-current", createdTime: "2026-08-05T00:00:00.000Z", updatedTime: "2026-08-10T00:00:00.000Z", issueType: "Feature" },
      { recordId: "rec-bug-current", createdTime: "2026-08-06T00:00:00.000Z", updatedTime: "2026-08-11T00:00:00.000Z", issueType: "Bug" },
      { recordId: "rec-feature-old", createdTime: "2026-08-01T00:00:00.000Z", updatedTime: "2026-08-12T00:00:00.000Z", issueType: "Feature" },
    ];
    for (const record of records) {
      await store.upsertLarkBaseTicket({
        baseId: "base", tableId: "table",
        record: { record_id: record.recordId, fields: { Title: record.recordId }, created_time: record.createdTime, updated_time: record.updatedTime },
        title: record.recordId,
      });
      await store.applyLarkBaseTicketCleaning({
        baseId: "base", tableId: "table", recordId: record.recordId, issueType: record.issueType,
      });
    }

    await expect(store.listLarkBaseTickets(1, {
      createdAfter: "2026-08-03T00:00:00.000Z",
      createdBefore: "2026-08-07T00:00:00.000Z",
      sourceUpdatedAtAfter: "2026-08-09T00:00:00.000Z",
      sourceUpdatedAtBefore: "2026-08-10T00:00:00.000Z",
      issueTypes: ["Feature"],
    })).resolves.toEqual([expect.objectContaining({ recordId: "rec-feature-current" })]);
    await expect(store.listLarkBaseTickets(10, { issueTypes: ["Feature"] })).resolves.toEqual([
      expect.objectContaining({ recordId: "rec-feature-old" }),
      expect.objectContaining({ recordId: "rec-feature-current" }),
    ]);

    await db.destroy();
    await pool.end();
  });

  it("reports merged GitHub PR snapshots separately from closed ones", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);

    await store.upsertGitHubPullRequest({
      owner: "acme",
      repo: "app",
      pullRequest: {
        number: 3,
        title: "Merged PR",
        body: null,
        html_url: "https://github.com/acme/app/pull/3",
        state: "closed",
        merged_at: "2026-08-09T00:00:00.000Z",
        updated_at: "2026-08-09T00:00:00.000Z",
        draft: false,
      },
    });

    await expect(store.listGitHubPullRequests(10)).resolves.toEqual([
      expect.objectContaining({ pullNumber: 3, state: "merged" }),
    ]);

    await db.destroy();
    await pool.end();
  });

  it("batch upserts and batch cleans Lark ticket snapshots idempotently", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    await store.upsertLarkBaseTickets([
      {
        baseId: "base", tableId: "table", title: "One", status: "Open",
        record: { record_id: "rec-1", fields: { "Ticket 编号": "SUP-1", 紧急度: "P1" } },
      },
      {
        baseId: "base", tableId: "table", title: "Two", status: "Open",
        record: { record_id: "rec-2", fields: { "Ticket 编号": "SUP-2", 紧急度: "P2" } },
      },
    ]);

    const cleaning = [
      { baseId: "base", tableId: "table", recordId: "rec-1", ticketNumber: "SUP-1", priority: "P1" },
      { baseId: "base", tableId: "table", recordId: "rec-2", ticketNumber: "SUP-2", priority: "P2" },
    ];
    await expect(store.applyLarkBaseTicketCleanings(cleaning)).resolves.toBe(2);
    await expect(store.applyLarkBaseTicketCleanings(cleaning)).resolves.toBe(0);
    await expect(store.getLarkBaseTicketsForCleaning(cleaning)).resolves.toEqual([
      expect.objectContaining({ recordId: "rec-1", ticketNumber: "SUP-1", priority: "P1" }),
      expect.objectContaining({ recordId: "rec-2", ticketNumber: "SUP-2", priority: "P2" }),
    ]);

    await db.destroy();
    await pool.end();
  });

  it("marks snapshots not seen by a completed full scope as stale without deleting them", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    await store.upsertGitHubPullRequest({
      owner: "acme", repo: "app",
      pullRequest: { number: 5, title: "Old", body: null, html_url: "https://github.com/acme/app/pull/5", state: "closed", merged_at: null, updated_at: "2026-08-01T00:00:00.000Z", draft: false },
    });
    await db.updateTable("github_pr_syncs").set({ last_seen_at: "2026-08-01T00:00:00.000Z" })
      .where("owner", "=", "acme").where("repo", "=", "app").execute();

    await expect(store.markGitHubPullRequestsUnseenStale("acme", "app", "2026-08-02T00:00:00.000Z")).resolves.toBe(1);
    await expect(db.selectFrom("github_pr_syncs").select(["pull_number", "stale"]).execute()).resolves.toEqual([
      { pull_number: 5, stale: true },
    ]);

    await db.destroy();
    await pool.end();
  });

  it("marks stale Meegle snapshots only within the completed work-item type", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    await Promise.all([
      store.upsertMeegleWorkitem({
        projectKey: "project", workItemTypeKey: "story",
        workitem: { id: "story-1", key: "story-1", name: "Story", type: "story", status: "Open", fields: {} },
      }),
      store.upsertMeegleWorkitem({
        projectKey: "project", workItemTypeKey: "tech-task",
        workitem: { id: "task-1", key: "task-1", name: "Task", type: "tech-task", status: "Open", fields: {} },
      }),
    ]);
    await db.updateTable("meegle_workitem_syncs").set({ last_seen_at: "2026-08-01T00:00:00.000Z" })
      .where("project_key", "=", "project").execute();

    await expect(store.markMeegleWorkitemsUnseenStale("project", "2026-08-02T00:00:00.000Z", "story")).resolves.toBe(1);
    await expect(db.selectFrom("meegle_workitem_syncs").select(["work_item_type_key", "stale"]).orderBy("work_item_type_key").execute()).resolves.toEqual([
      { work_item_type_key: "story", stale: true },
      { work_item_type_key: "tech-task", stale: false },
    ]);

    await db.destroy();
    await pool.end();
  });

  it("writes cleaned GitHub fields back to the source snapshot and skips an unchanged result", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    await store.upsertGitHubPullRequest({
      owner: "acme",
      repo: "app",
      pullRequest: {
        number: 4,
        title: "Projection source",
        body: null,
        html_url: "https://github.com/acme/app/pull/4",
        state: "open",
        merged_at: null,
        updated_at: "2026-08-11T00:00:00.000Z",
        draft: false,
      },
    });

    await expect(store.applyGitHubPullRequestCleaning({
      owner: "acme",
      repo: "app",
      pullNumber: 4,
      author: "octo",
      mergedBy: "merger",
      reviewers: ["reviewer"],
      labels: ["bug"],
      createdAt: "2026-08-11T00:00:00.000Z",
    })).resolves.toBe(true);
    await expect(store.applyGitHubPullRequestCleaning({
      owner: "acme",
      repo: "app",
      pullNumber: 4,
      author: "octo",
      mergedBy: "merger",
      reviewers: ["reviewer"],
      labels: ["bug"],
      createdAt: "2026-08-11T00:00:00.000Z",
    })).resolves.toBe(false);
    await expect(db.selectFrom("github_pr_syncs").selectAll().execute()).resolves.toEqual([
      expect.objectContaining({
        title: "Projection source",
        author_login: "octo",
        merged_by_login: "merger",
        reviewers_json: JSON.stringify(["reviewer"]),
        labels_json: JSON.stringify(["bug"]),
      }),
    ]);

    await db.destroy();
    await pool.end();
  });
});
