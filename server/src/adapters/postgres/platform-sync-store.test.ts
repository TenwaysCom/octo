import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresPlatformSyncStore } from "./platform-sync-store.js";

describe("PostgresPlatformSyncStore", () => {
  it("upserts independent Meegle, GitHub and Lark snapshots", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);

    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem: {
        id: "1", key: "S-1", name: "Original", type: "story", workItemType: "Feature",
        status: "In Progress", statusKey: "status_started", subStage: "Development", subStageKey: "node_dev", fields: {},
      },
    });
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem: {
        id: "1", key: "S-1", name: "Updated", type: "story", workItemType: "Feature",
        status: "Finished", statusKey: "status_finished", subStage: "Done", subStageKey: "node_done", fields: {},
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
        title: "PR",
        body: "PR description",
        html_url: "https://github.com/acme/app/pull/2",
        state: "open",
        merged_at: null,
        updated_at: "2026-08-06T00:00:00.000Z",
        draft: false,
      },
    });
    await store.upsertLarkBaseTicket({
      baseId: "base",
      tableId: "table",
      record: { record_id: "rec-1", fields: { Title: "Ticket" } },
      title: "Ticket",
      status: "Open",
    });

    await expect(db.selectFrom("meegle_workitem_syncs").selectAll().execute())
      .resolves.toEqual([expect.objectContaining({
        title: "Updated",
        work_item_type: "Feature",
        status_key: "status_finished",
        status: "Finished",
        sub_stage_key: "node_done",
        sub_stage: "Done",
      })]);
    await expect(db.selectFrom("meegle_sync_mappings").selectAll().execute())
      .resolves.toEqual([expect.objectContaining({ source_key: "story", display_value: "Feature" })]);
    await expect(db.selectFrom("github_pr_syncs").selectAll().execute())
      .resolves.toEqual([expect.objectContaining({
        pull_number: 2,
        description: "PR description",
        state: "open",
      })]);
    await expect(db.selectFrom("lark_base_ticket_syncs").selectAll().execute())
      .resolves.toEqual([expect.objectContaining({ record_id: "rec-1", ticket_status: "Open" })]);

    await db.destroy();
    await pool.end();
  });
});
