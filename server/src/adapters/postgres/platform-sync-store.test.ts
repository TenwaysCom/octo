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
        status: "In Progress", statusKey: "status_started", subStage: "Development", subStageKey: "node_dev", priority: "P1", createdAt: "2026-07-31T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", fields: {},
      },
      sprintRelation: { present: true, sprintId: "cycle-1", sprintName: "Sprint 1" },
      lifecycle: {
        addToCycleTime: "2026-08-01T01:00:00.000Z",
        currentNodeStartTime: "2026-08-02T01:00:00.000Z",
        itemStartTime: "2026-08-01T02:00:00.000Z",
        itemFinishTime: "2026-08-02T00:00:00.000Z",
      },
    });
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem: {
        id: "1", key: "S-1", name: "Updated", type: "story", workItemType: "Feature",
        status: "Finished", statusKey: "status_finished", subStage: "Done", subStageKey: "node_done", priority: "P0", createdAt: "2026-07-31T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", fields: {},
      },
      sprintRelation: { present: true, sprintId: "cycle-1", sprintName: "Sprint 1" },
      lifecycle: {
        addToCycleTime: "2026-08-01T01:00:00.000Z",
        currentNodeStartTime: "2026-08-02T01:00:00.000Z",
        itemStartTime: "2026-08-01T02:00:00.000Z",
        itemFinishTime: "2026-08-02T00:00:00.000Z",
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
        sprint_id: "cycle-1",
        current_node_start_time: "2026-08-02T01:00:00.000Z",
        item_finish_time: "2026-08-02T00:00:00.000Z",
        created_at: "2026-07-31T00:00:00.000Z",
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
      sprintId: "cycle-1", createdAt: "2026-07-31T00:00:00.000Z", currentNodeStartTime: "2026-08-02T01:00:00.000Z", itemFinishTime: "2026-08-02T00:00:00.000Z",
    })]);
    await expect(store.listMeegleWorkitems(10, { sprints: ["Sprint 1"] })).resolves.toHaveLength(1);
    await expect(store.countMeegleWorkitems({ sprints: ["Sprint 1"] })).resolves.toBe(1);
    await expect(store.listMeegleWorkitems(10, { sprints: ["Sprint 2"] })).resolves.toEqual([]);
    await expect(store.listMeegleSprints()).resolves.toEqual(["Sprint 1"]);
    await expect(store.listMeegleWorkitemsByIds(["1", "missing", "1"])).resolves.toEqual([
      expect.objectContaining({
        workItemId: "1", title: "Updated", status: "Finished", sprintId: "cycle-1", sprint: "Sprint 1", version: "Version 1",
        createdAt: "2026-07-31T00:00:00.000Z", addToCycleTime: "2026-08-01T01:00:00.000Z", currentNodeStartTime: "2026-08-02T01:00:00.000Z", itemStartTime: "2026-08-01T02:00:00.000Z", itemFinishTime: "2026-08-02T00:00:00.000Z",
      }),
    ]);
    await expect(store.listGitHubPullRequests(10)).resolves.toEqual([expect.objectContaining({
      pullNumber: 2, title: "PR m-123 f-456", state: "open",
      meegleIds: ["123", "456", "789"],
    })]);
    await expect(store.findGitHubPullRequest({ owner: "acme", repo: "app", pullNumber: 2 })).resolves.toEqual(expect.objectContaining({
      pullNumber: 2, description: "PR description m-123 and f-789", meegleIds: ["123", "456", "789"],
    }));
    await expect(store.findGitHubPullRequest({ owner: "acme", repo: "app", pullNumber: 404 })).resolves.toBeUndefined();
    await expect(store.countGitHubPullRequests()).resolves.toBe(1);
    await expect(store.listGitHubPullRequestLinks(["123", "456"])) .resolves.toEqual([
      expect.objectContaining({ meegleId: "123", pullNumber: 2, headRef: "feature/m-123", baseRef: "main", state: "open", isDraft: false }),
      expect.objectContaining({ meegleId: "456", pullNumber: 2, headRef: "feature/m-123", baseRef: "main", state: "open", isDraft: false }),
    ]);
    await expect(store.listLarkBaseTickets(10)).resolves.toEqual([expect.objectContaining({
      recordId: "rec-1", ticketStatus: "Open", requester: "PM Ada", priority: "P1",
      sharedUrl: "https://example.larksuite.com/base/base?table=table&record=rec-1",
      ticketAi: expect.objectContaining({ fields: { "AI分析状态": "已分析" } }),
    })]);
    await expect(store.countLarkBaseTickets({ statuses: ["Open"] })).resolves.toBe(1);
    await expect(store.findLarkBaseTicketByRecordId("rec-1")).resolves.toEqual({ baseId: "base", tableId: "table", recordId: "rec-1" });

    await db.destroy();
    await pool.end();
  });

  it("sorts and filters mixed legacy ISO and new Meegle updated_at values chronologically", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    for (const workitem of [
      { id: "legacy", updatedAt: "2026-08-11T23:00:00.000Z" },
      { id: "raw", updatedAt: "2026-08-12 00:00:00" },
    ]) {
      await store.upsertMeegleWorkitem({
        projectKey: "project",
        workItemTypeKey: "story",
        workitem: {
          id: workitem.id,
          key: workitem.id,
          name: workitem.id,
          type: "story",
          status: "In Progress",
          fields: {},
          updatedAt: workitem.updatedAt,
        },
      });
    }

    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([
      expect.objectContaining({ workItemId: "raw" }),
      expect.objectContaining({ workItemId: "legacy" }),
    ]);
    await expect(store.listMeegleWorkitems(10, {
      sourceUpdatedAtAfter: "2026-08-11T23:30:00.000Z",
    })).resolves.toEqual([expect.objectContaining({ workItemId: "raw" })]);
    await expect(store.listMeegleWorkitems(10, {
      sourceUpdatedAtBefore: "2026-08-11T23:30:00.000Z",
    })).resolves.toEqual([expect.objectContaining({ workItemId: "legacy" })]);

    await db.destroy();
    await pool.end();
  });

  it("replaces related people transactionally and supports batched and reverse lookup", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    for (const id of ["1", "2", "3"]) {
      await store.upsertMeegleWorkitem({
        projectKey: "project",
        workItemTypeKey: "story",
        workitem: { id, key: `S-${id}`, name: `Story ${id}`, type: "story", status: "Open", fields: {} },
      });
    }
    const firstProjection = {
      present: true,
      members: [
        { roleKey: "developer", roleName: "Developer", memberKey: "u-1", memberName: "Ada", roleOrder: 0, memberOrder: 0 },
        { roleKey: "reviewer", roleName: "Reviewer", memberKey: "u-1", memberName: "Ada", roleOrder: 1, memberOrder: 0 },
      ],
    };
    const cleaningInput = {
      projectKey: "project",
      workItemTypeKey: "story",
      workItemId: "1",
      observedAt: "2026-09-01T00:00:00.000Z",
      roleMembers: firstProjection,
      version: "Version 1",
      bugs: [],
    };

    await expect(store.applyMeegleWorkitemCleaning(cleaningInput)).resolves.toBe(true);
    await expect(store.applyMeegleWorkitemCleaning(cleaningInput)).resolves.toBe(false);
    await expect(store.listMeegleWorkitemRoleMembers([
      { projectKey: "project", workItemTypeKey: "story", workItemId: "1" },
      { projectKey: "project", workItemTypeKey: "story", workItemId: "1" },
    ])).resolves.toEqual([
      expect.objectContaining({ roleKey: "developer", memberKey: "u-1", roleOrder: 0, memberOrder: 0 }),
      expect.objectContaining({ roleKey: "reviewer", memberKey: "u-1", roleOrder: 1, memberOrder: 0 }),
    ]);

    await expect(store.applyMeegleWorkitemCleaning({
      ...cleaningInput,
      roleMembers: { present: false, members: [] },
    })).resolves.toBe(false);
    await expect(store.listMeegleWorkitemRoleMembers([{ projectKey: "project", workItemTypeKey: "story", workItemId: "1" }])).resolves.toHaveLength(2);

    await store.applyMeegleWorkitemCleaning({
      ...cleaningInput,
      workItemId: "2",
      observedAt: "2026-09-02T00:00:00.000Z",
      roleMembers: {
        present: true,
        members: [{ roleKey: "developer", roleName: "Developer", memberKey: "u-2", memberName: "Bob", roleOrder: 0, memberOrder: 0 }],
      },
    });
    await expect(store.listMeegleWorkitems(10, { relatedPersonMemberKeys: ["u-1"] })).resolves.toEqual([
      expect.objectContaining({ workItemId: "1" }),
    ]);
    await expect(store.countMeegleWorkitems({ relatedPersonMemberKeys: ["u-1", "u-2"] })).resolves.toBe(2);
    await expect(store.listMeegleRelatedPersonOptions()).resolves.toEqual([
      { memberKey: "u-1", name: "Ada", roleNames: ["Developer", "Reviewer"] },
      { memberKey: "u-2", name: "Bob", roleNames: ["Developer"] },
    ]);

    await store.applyMeegleWorkitemCleaning({
      ...cleaningInput,
      workItemId: "3",
      observedAt: "2026-09-03T00:00:00.000Z",
      roleMembers: {
        present: true,
        members: [
          { roleKey: "developer", roleName: "Developer", memberKey: "u-1", memberName: "Ada", roleOrder: 0, memberOrder: 0 },
          { roleKey: "reviewer", roleName: "Reviewer", memberKey: "u-2", memberName: "Bob", roleOrder: 1, memberOrder: 0 },
        ],
      },
    });
    const combinedFilters = { relatedPersonMemberKeys: ["u-1"], subscribedMemberKey: "u-2" };
    await expect(store.listMeegleWorkitems(10, combinedFilters)).resolves.toEqual([
      expect.objectContaining({ workItemId: "3" }),
    ]);
    await expect(store.countMeegleWorkitems(combinedFilters)).resolves.toBe(1);

    await expect(store.applyMeegleWorkitemCleaning({
      ...cleaningInput,
      version: "must-roll-back",
      roleMembers: {
        present: true,
        members: [firstProjection.members[0], firstProjection.members[0]],
      },
    })).rejects.toThrow();
    await expect(db.selectFrom("meegle_workitem_syncs").select("version").where("work_item_id", "=", "1").executeTakeFirst()).resolves.toEqual({ version: "Version 1" });
    await expect(store.listMeegleWorkitemRoleMembers([{ projectKey: "project", workItemTypeKey: "story", workItemId: "1" }])).resolves.toHaveLength(2);

    await expect(store.applyMeegleWorkitemCleaning({
      ...cleaningInput,
      roleMembers: { present: true, members: [] },
    })).resolves.toBe(true);
    await expect(store.listMeegleWorkitemRoleMembers([{ projectKey: "project", workItemTypeKey: "story", workItemId: "1" }])).resolves.toEqual([]);

    await db.destroy();
    await pool.end();
  });

  it("stores Sprint objects as metadata without leaking them into the Meegle workitem list", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "642ebe04168eea39eeb0d34a",
      workitem: {
        id: "sprint-1", key: "", name: "Sprint 2", type: "642ebe04168eea39eeb0d34a",
        workItemType: "Sprint", status: "Ended", updatedAt: "2026-08-27T00:00:00.000Z",
        fields: { work_item_fields: [{ key: "description", value: "Sprint 说明" }] },
      },
    });
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem: { id: "story-1", key: "", name: "Story", type: "story", status: "New", fields: {} },
    });
    await db.updateTable("meegle_workitem_syncs").set({ sprint: "Sprint 1" }).where("work_item_id", "=", "story-1").execute();

    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([expect.objectContaining({ workItemId: "story-1" })]);
    await expect(store.countMeegleWorkitems()).resolves.toBe(1);
    await expect(store.listMeegleSprints()).resolves.toEqual(["Sprint 1", "Sprint 2"]);
    await expect(store.listMeegleSprintSnapshots()).resolves.toEqual([
      expect.objectContaining({ workItemId: "sprint-1", title: "Sprint 2", status: "Ended", sourcePayload: expect.any(Object) }),
    ]);

    await db.destroy();
    await pool.end();
  });

  it("preserves, changes, and clears Sprint membership using the observed relation", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    const workitem = {
      id: "story-1", key: "S-1", name: "Story", type: "story", status: "Start", fields: {},
    };

    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem,
      sprintRelation: { present: true, sprintId: "sprint-a", sprintName: "Sprint A" },
      lifecycle: { addToCycleTime: "2026-08-01T00:00:00.000Z" },
    });
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem,
      sprintRelation: { present: true, sprintId: "sprint-a", sprintName: "Sprint A renamed" },
      lifecycle: { addToCycleTime: "2026-08-02T00:00:00.000Z" },
    });
    await expect(store.listMeegleSprintMemberships()).resolves.toEqual([
      expect.objectContaining({
        workItemId: "story-1",
        sprintId: "sprint-a",
        sprint: "Sprint A renamed",
        membershipSource: "historical_inferred",
        addToCycleTime: "2026-08-01T00:00:00.000Z",
      }),
    ]);
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem,
      sprintRelation: { present: false },
    });
    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([
      expect.objectContaining({
        sprintId: "sprint-a",
        sprint: "Sprint A renamed",
        addToCycleTime: "2026-08-01T00:00:00.000Z",
      }),
    ]);

    const observedBefore = Date.now();
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem,
      sprintRelation: { present: true, sprintId: "sprint-b", sprintName: "Sprint B" },
      lifecycle: { addToCycleTime: "2026-07-01T00:00:00.000Z" },
    });
    const [changed] = await store.listMeegleWorkitems(10);
    const changedAt = Date.parse(changed?.addToCycleTime || "");
    expect(changed).toEqual(expect.objectContaining({ sprintId: "sprint-b", sprint: "Sprint B" }));
    expect(changedAt).toBeGreaterThanOrEqual(observedBefore);
    expect(changedAt).toBeLessThanOrEqual(Date.now());

    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem,
      sprintRelation: { present: true },
    });
    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([
      expect.objectContaining({ sprintId: undefined, sprint: undefined, addToCycleTime: undefined }),
    ]);

    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem: { ...workitem, id: "story-2", key: "S-2" },
      sprintRelation: { present: true, sprintId: "sprint-c", sprintName: "Sprint C" },
      sprintObservedAt: "2026-08-27T12:00:00.000Z",
      lifecycle: { addToCycleTime: "2026-07-01T00:00:00.000Z" },
    });
    await expect(store.listMeegleWorkitems(10)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        workItemId: "story-2",
        sprintId: "sprint-c",
        addToCycleTime: "2026-08-27T12:00:00.000Z",
      }),
    ]));

    await db.destroy();
    await pool.end();
  });

  it("replaces and clears lifecycle dates from the current source values", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    const baseWorkitem = {
      id: "story-lifecycle", key: "S-LIFE", name: "Lifecycle", type: "story", status: "In Progress", fields: {},
    };
    const upsertLifecycle = async (lifecycle: {
      currentNodeStartTime: string | null;
      itemStartTime: string | null;
      itemFinishTime: string | null;
    }) => store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem: baseWorkitem,
      lifecycle,
    });

    await upsertLifecycle({
      currentNodeStartTime: "2026-08-22T00:00:00.000Z",
      itemStartTime: "2026-08-22T00:00:00.000Z",
      itemFinishTime: null,
    });
    await upsertLifecycle({
      currentNodeStartTime: "2026-08-25T00:00:00.000Z",
      itemStartTime: "2026-08-25T00:00:00.000Z",
      itemFinishTime: null,
    });
    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([
      expect.objectContaining({
        itemStartTime: "2026-08-25T00:00:00.000Z",
        currentNodeStartTime: "2026-08-25T00:00:00.000Z",
        itemFinishTime: undefined,
      }),
    ]);

    await upsertLifecycle({
      currentNodeStartTime: "2026-08-26T00:00:00.000Z",
      itemStartTime: "2026-08-25T00:00:00.000Z",
      itemFinishTime: "2026-08-26T00:00:00.000Z",
    });
    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([
      expect.objectContaining({
        itemStartTime: "2026-08-25T00:00:00.000Z",
        currentNodeStartTime: "2026-08-26T00:00:00.000Z",
        itemFinishTime: "2026-08-26T00:00:00.000Z",
      }),
    ]);

    await upsertLifecycle({ currentNodeStartTime: "2026-08-27T00:00:00.000Z", itemStartTime: null, itemFinishTime: null });
    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([
      expect.objectContaining({
        itemStartTime: undefined,
        currentNodeStartTime: "2026-08-27T00:00:00.000Z",
        itemFinishTime: undefined,
      }),
    ]);

    await upsertLifecycle({ currentNodeStartTime: null, itemStartTime: null, itemFinishTime: null });
    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([
      expect.objectContaining({ currentNodeStartTime: undefined, itemStartTime: undefined, itemFinishTime: undefined }),
    ]);

    await db.destroy();
    await pool.end();
  });

  it("records independent Sprint membership segments across change, removal, and re-entry", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    const workitem = {
      id: "story-history", key: "S-HISTORY", name: "History", type: "story", status: "In Progress", fields: {},
    };
    const observe = async (input: {
      at: string;
      sprintId?: string;
      phase: "new" | "started" | "finished";
      start?: string | null;
      finish?: string | null;
    }) => store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem,
      sprintRelation: { present: true, ...(input.sprintId ? { sprintId: input.sprintId, sprintName: `Sprint ${input.sprintId}` } : {}) },
      sprintObservedAt: input.at,
      lifecycle: {
        itemStartTime: input.phase === "new" ? null : input.start,
        itemFinishTime: input.phase === "finished" ? input.finish : null,
      },
    });

    await observe({ at: "2026-08-01T00:00:00.000Z", sprintId: "a", phase: "started", start: "2026-07-20T00:00:00.000Z" });
    await observe({ at: "2026-08-05T00:00:00.000Z", sprintId: "a", phase: "finished", finish: "2026-08-05T00:00:00.000Z" });
    await observe({ at: "2026-08-06T00:00:00.000Z", sprintId: "a", phase: "started" });
    await observe({ at: "2026-08-07T00:00:00.000Z", sprintId: "a", phase: "finished", finish: "2026-08-07T00:00:00.000Z" });
    await observe({ at: "2026-08-08T00:00:00.000Z", sprintId: "b", phase: "started", start: "2026-08-02T00:00:00.000Z" });
    await observe({ at: "2026-08-09T00:00:00.000Z", sprintId: "b", phase: "new" });
    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([
      expect.objectContaining({
        sprintId: "b",
        addToCycleTime: "2026-08-08T00:00:00.000Z",
        itemStartTime: undefined,
        itemFinishTime: undefined,
      }),
    ]);
    await observe({ at: "2026-08-10T00:00:00.000Z", phase: "new" });
    await observe({ at: "2026-08-11T00:00:00.000Z", sprintId: "b", phase: "started", start: "2026-08-11T01:00:00.000Z" });

    await expect(db.selectFrom("meegle_workitem_sprint_memberships")
      .selectAll()
      .where("work_item_id", "=", workitem.id)
      .orderBy("added_at")
      .execute()).resolves.toEqual([
      expect.objectContaining({
        sprint_id: "a",
        added_at: "2026-08-01T00:00:00.000Z",
        started_at: "2026-08-01T00:00:00.000Z",
        finished_at: "2026-08-07T00:00:00.000Z",
        removed_at: "2026-08-08T00:00:00.000Z",
        source: "incremental_observed",
      }),
      expect.objectContaining({
        sprint_id: "b",
        added_at: "2026-08-08T00:00:00.000Z",
        started_at: null,
        finished_at: null,
        removed_at: "2026-08-10T00:00:00.000Z",
        source: "incremental_observed",
      }),
      expect.objectContaining({
        sprint_id: "b",
        added_at: "2026-08-11T00:00:00.000Z",
        started_at: "2026-08-11T01:00:00.000Z",
        finished_at: null,
        removed_at: null,
        source: "incremental_observed",
      }),
    ]);
    await expect(store.listMeegleWorkitems(10)).resolves.toEqual([
      expect.objectContaining({
        sprintId: "b",
        addToCycleTime: "2026-08-11T00:00:00.000Z",
        itemStartTime: "2026-08-11T01:00:00.000Z",
      }),
    ]);
    await expect(store.listMeegleSprintMemberships()).resolves.toEqual([
      expect.objectContaining({ sprintId: "a", membershipRemovedAt: "2026-08-08T00:00:00.000Z", membershipSource: "incremental_observed" }),
      expect.objectContaining({ sprintId: "b", addToCycleTime: "2026-08-08T00:00:00.000Z", membershipRemovedAt: "2026-08-10T00:00:00.000Z" }),
      expect.objectContaining({ sprintId: "b", addToCycleTime: "2026-08-11T00:00:00.000Z" }),
    ]);

    await db.destroy();
    await pool.end();
  });

  it("lazily initializes an existing current Sprint as inferred without upgrading its source", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    const workitem = {
      id: "story-inferred", key: "S-INFERRED", name: "Inferred", type: "story", status: "In Progress", fields: {},
    };
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem,
      sprintRelation: { present: true, sprintId: "a", sprintName: "Sprint A" },
      lifecycle: {
        addToCycleTime: "2026-08-01T00:00:00.000Z",
        itemStartTime: "2026-08-03T00:00:00.000Z",
      },
    });
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem,
      sprintRelation: { present: true, sprintId: "a", sprintName: "Sprint A" },
      sprintObservedAt: "2026-08-10T00:00:00.000Z",
      lifecycle: { itemFinishTime: "2026-08-09T00:00:00.000Z" },
    });
    await store.upsertMeegleWorkitem({
      projectKey: "project",
      workItemTypeKey: "story",
      workitem,
      sprintRelation: { present: false },
      sprintObservedAt: "2026-08-11T00:00:00.000Z",
      lifecycle: { itemFinishTime: null },
    });

    await expect(db.selectFrom("meegle_workitem_sprint_memberships")
      .selectAll()
      .where("work_item_id", "=", workitem.id)
      .execute()).resolves.toEqual([
      expect.objectContaining({
        sprint_id: "a",
        added_at: "2026-08-01T00:00:00.000Z",
        started_at: "2026-08-03T00:00:00.000Z",
        finished_at: null,
        removed_at: null,
        source: "historical_inferred",
      }),
    ]);

    await db.destroy();
    await pool.end();
  });

  it("filters Lark Ticket snapshots by created time, source update time, and issue type before applying the limit", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    const records = [
      { recordId: "rec-feature-current", createdTime: "2026-08-05T00:00:00.000Z", updatedTime: "2026-08-10T00:00:00.000Z", issueType: "Feature", status: "Open", priority: "P1", responsible: "Ada" },
      { recordId: "rec-bug-current", createdTime: "2026-08-06T00:00:00.000Z", updatedTime: "2026-08-11T00:00:00.000Z", issueType: "Bug", status: "Finish", priority: "P0", responsible: "Bob" },
      { recordId: "rec-feature-old", createdTime: "2026-08-01T00:00:00.000Z", updatedTime: "2026-08-12T00:00:00.000Z", issueType: "Feature", status: "Open", priority: "P2", responsible: "Ada" },
    ];
    for (const record of records) {
      await store.upsertLarkBaseTicket({
        baseId: "base", tableId: "table",
        record: { record_id: record.recordId, fields: { Title: record.recordId }, created_time: record.createdTime, updated_time: record.updatedTime },
        title: record.recordId, status: record.status,
      });
      await store.applyLarkBaseTicketCleaning({
        baseId: "base", tableId: "table", recordId: record.recordId, issueType: record.issueType,
        priority: record.priority, responsible: record.responsible,
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
    await expect(store.countLarkBaseTickets({ issueTypes: ["Feature"] })).resolves.toBe(2);
    await expect(store.listLarkBaseTickets(10, {
      statuses: ["Open"], priorities: ["P1"], responsibles: ["Ada"], quickFilter: "unsynced",
    })).resolves.toEqual([expect.objectContaining({ recordId: "rec-feature-current" })]);

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

  it("filters GitHub PR snapshots before applying pagination", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    const store = new PostgresPlatformSyncStore(db);
    const pullRequests = [
      { number: 1, repo: "app", state: "open", draft: false, labels: ["bug"], reviewers: ["ada"], updatedAt: "2026-08-12T00:00:00.000Z" },
      { number: 2, repo: "app", state: "open", draft: true, labels: ["feature"], reviewers: ["bob"], updatedAt: "2026-08-11T00:00:00.000Z" },
      { number: 3, repo: "api", state: "closed", draft: false, labels: ["bug"], reviewers: ["ada"], updatedAt: "2026-08-10T00:00:00.000Z" },
    ];
    for (const pullRequest of pullRequests) {
      await store.upsertGitHubPullRequest({
        owner: "acme",
        repo: pullRequest.repo,
        pullRequest: {
          number: pullRequest.number,
          title: `PR ${pullRequest.number}`,
          body: null,
          html_url: `https://github.com/acme/${pullRequest.repo}/pull/${pullRequest.number}`,
          state: pullRequest.state,
          merged_at: null,
          updated_at: pullRequest.updatedAt,
          draft: pullRequest.draft,
        },
      });
      await store.applyGitHubPullRequestCleaning({
        owner: "acme",
        repo: pullRequest.repo,
        pullNumber: pullRequest.number,
        labels: pullRequest.labels,
        reviewers: pullRequest.reviewers,
      });
    }

    const filters = {
      statuses: ["open"],
      repositories: ["acme / app"],
      labels: ["bug"],
      reviewers: ["ada"],
      sourceUpdatedAtAfter: "2026-08-11T12:00:00.000Z",
    };
    await expect(store.listGitHubPullRequests(1, filters)).resolves.toEqual([
      expect.objectContaining({ pullNumber: 1, repo: "app", state: "open", isDraft: false }),
    ]);
    await expect(store.countGitHubPullRequests(filters)).resolves.toBe(1);
    await expect(store.listGitHubPullRequests(10, { statuses: ["Draft"] })).resolves.toEqual([
      expect.objectContaining({ pullNumber: 2, isDraft: true }),
    ]);
    await expect(store.listGitHubPullRequests(1, { offset: 1 })).resolves.toHaveLength(1);

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
