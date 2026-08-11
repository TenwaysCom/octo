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
        status: "In Progress", statusKey: "status_started", subStage: "Development", subStageKey: "node_dev", updatedAt: "2026-08-01T00:00:00.000Z", fields: {},
      },
    });
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem: {
        id: "1", key: "S-1", name: "Updated", type: "story", workItemType: "Feature",
        status: "Finished", statusKey: "status_finished", subStage: "Done", subStageKey: "node_done", updatedAt: "2026-08-02T00:00:00.000Z", fields: {},
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
      priority: "P1",
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
      sprint: "Sprint 1", version: "Version 1", bugs: ["Bug 1"],
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
      recordId: "rec-1", ticketStatus: "Open", priority: "P1",
    })]);

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
