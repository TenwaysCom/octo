import { sql, type Kysely } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import type { MeegleSyncMapping, MeegleWorkitem } from "../meegle/meegle-client.js";
import type { GitHubPrDetails } from "../github/github-types.js";
import type { LarkBitableRecord } from "../lark/lark-client.js";
import {
  parseLarkTicketAiData,
  pickLarkTicketAiFields,
  type LarkTicketAiData,
  type LarkTicketAiFields,
} from "../../domain/lark-ticket-ai.js";
import { projectMeegleSprintMembershipTransition } from "../../domain/meegle-sprint-membership.js";
import { MEEGLE_SPRINT_API_NAME, MEEGLE_SPRINT_WORKITEM_TYPE_KEY } from "../../domain/meegle-workitem-types.js";

const MEEGLE_SPRINT_TYPE_KEYS = [MEEGLE_SPRINT_API_NAME, MEEGLE_SPRINT_WORKITEM_TYPE_KEY];

export interface PlatformSyncStore {
  upsertMeegleWorkitem(input: {
    projectKey: string;
    workItemTypeKey: string;
    workitem: MeegleWorkitem;
    sprintRelation?: MeegleSprintRelationFields;
    sprintObservedAt?: string;
    lifecycle?: MeegleWorkitemLifecycleFields;
  }): Promise<void>;
  upsertMeegleMappings(mappings: MeegleSyncMapping[]): Promise<void>;
  upsertGitHubPullRequest(input: {
    owner: string;
    repo: string;
    pullRequest: GitHubPrDetails;
  }): Promise<void>;
  upsertLarkBaseTicket(input: {
    baseId: string;
    tableId: string;
    record: LarkBitableRecord;
    title: string;
    status?: string;
  }): Promise<void>;
  upsertLarkBaseTickets(inputs: LarkBaseTicketUpsertInput[]): Promise<void>;
  setLarkBaseTicketSharedUrl(input: {
    baseId: string;
    tableId: string;
    recordId: string;
    sharedUrl: string;
  }): Promise<void>;
  upsertLarkBaseTicketAi(input: LarkBaseTicketSyncRef & { fields: LarkTicketAiFields }): Promise<boolean>;
  findLarkBaseTicketByRecordId(recordId: string): Promise<LarkBaseTicketSyncRef | undefined>;
  getMeegleWorkitemsForCleaning(refs: MeegleWorkitemSyncRef[]): Promise<MeegleWorkitemSyncItem[]>;
  getGitHubPullRequestsForCleaning(refs: GitHubPullRequestSyncRef[]): Promise<GitHubPullRequestSyncItem[]>;
  getLarkBaseTicketsForCleaning(refs: LarkBaseTicketSyncRef[]): Promise<LarkBaseTicketSyncItem[]>;
  applyMeegleWorkitemCleaning(input: MeegleWorkitemCleaningInput): Promise<boolean>;
  applyGitHubPullRequestCleaning(input: GitHubPullRequestCleaningInput): Promise<boolean>;
  applyLarkBaseTicketCleaning(input: LarkBaseTicketCleaningInput): Promise<boolean>;
  applyLarkBaseTicketCleanings(inputs: LarkBaseTicketCleaningInput[]): Promise<number>;
  listMeegleWorkitems(limit: number, filters?: MeegleWorkitemListFilters): Promise<MeegleWorkitemSyncItem[]>;
  countMeegleWorkitems(filters?: MeegleWorkitemListFilters): Promise<number>;
  listMeegleSprints(): Promise<string[]>;
  listMeegleWorkitemsByIds(workItemIds: string[]): Promise<MeegleWorkitemSyncItem[]>;
  listMeegleSprintSnapshots(): Promise<MeegleWorkitemSyncItem[]>;
  listMeegleSprintMemberships(): Promise<MeegleSprintMembershipSyncItem[]>;
  listGitHubPullRequestLinks(meegleWorkItemIds: string[]): Promise<GitHubPullRequestLink[]>;
  findGitHubPullRequest(ref: GitHubPullRequestSyncRef): Promise<GitHubPullRequestSyncItem | undefined>;
  listGitHubPullRequests(limit: number, filters?: GitHubPullRequestListFilters): Promise<GitHubPullRequestSyncItem[]>;
  countGitHubPullRequests(filters?: GitHubPullRequestListFilters): Promise<number>;
  listLarkBaseTickets(limit: number, filters?: LarkBaseTicketListFilters): Promise<LarkBaseTicketSyncItem[]>;
  countLarkBaseTickets(filters?: LarkBaseTicketListFilters): Promise<number>;
}

export interface MeegleWorkitemSyncItem {
  projectKey: string;
  projectName?: string;
  workItemTypeKey: string;
  workItemId: string;
  workItemKey?: string;
  title: string;
  workItemType?: string;
  statusKey?: string;
  status?: string;
  subStageKey?: string;
  subStage?: string;
  sprintId?: string;
  sprint?: string;
  version?: string;
  system?: string;
  bugs?: string[];
  assignee?: string;
  priority?: string;
  createdAt?: string;
  addToCycleTime?: string;
  currentNodeStartTime?: string;
  itemStartTime?: string;
  itemFinishTime?: string;
  sourcePayload?: MeegleWorkitem;
  sourceUpdatedAt?: string;
  syncedAt: string;
}

export interface MeegleWorkitemLifecycleFields {
  phase?: "new" | "started" | "finished";
  addToCycleTime?: string;
  currentNodeStartTime?: string | null;
  itemStartTime?: string | null;
  itemFinishTime?: string | null;
}

export interface MeegleSprintMembershipSyncItem extends MeegleWorkitemSyncItem {
  sprintId: string;
  membershipRemovedAt?: string;
  membershipSource: "historical_inferred" | "incremental_observed";
}

export interface MeegleSprintRelationFields {
  present: boolean;
  sprintId?: string;
  sprintName?: string;
}

export interface MeegleWorkitemSyncRef {
  projectKey: string;
  workItemTypeKey: string;
  workItemId: string;
}

export interface GitHubPullRequestSyncRef {
  owner: string;
  repo: string;
  pullNumber: number;
}

export interface LarkBaseTicketSyncRef {
  baseId: string;
  tableId: string;
  recordId: string;
}

export interface LarkBaseTicketUpsertInput {
  baseId: string;
  tableId: string;
  record: LarkBitableRecord;
  title: string;
  status?: string;
}

export interface MeegleWorkitemCleaningInput extends MeegleWorkitemSyncRef {
  sprintRelation?: MeegleSprintRelationFields;
  lifecycle?: MeegleWorkitemLifecycleFields;
  observedAt: string;
  version?: string;
  system?: string;
  bugs: string[];
}

export interface GitHubPullRequestCleaningInput extends GitHubPullRequestSyncRef {
  author?: string;
  mergedBy?: string;
  reviewers: string[];
  labels: string[];
  createdAt?: string;
}

export interface LarkBaseTicketCleaningInput extends LarkBaseTicketSyncRef {
  ticketNumber?: string;
  issueType?: string;
  requester?: string;
  responsible?: string;
  priority?: string;
  detailDescription?: string;
  meegleLink?: string;
  larkMessageLink?: string;
}

export interface GitHubPullRequestSyncItem {
  owner: string;
  repo: string;
  pullNumber: number;
  title: string;
  description?: string;
  state: string;
  htmlUrl: string;
  authorLogin?: string;
  mergedBy?: string;
  headRef?: string;
  baseRef?: string;
  isDraft: boolean;
  meegleIds: string[];
  sourcePayload?: GitHubPrDetails;
  reviewers?: string[];
  labels?: string[];
  createdAt?: string;
  sourceUpdatedAt?: string;
  syncedAt: string;
}

export interface GitHubPullRequestLink {
  meegleId: string;
  owner: string;
  repo: string;
  pullNumber: number;
  title: string;
  htmlUrl: string;
  headRef?: string;
  baseRef?: string;
  state: string;
  isDraft: boolean;
}

export interface LarkBaseTicketSyncItem {
  baseId: string;
  tableId: string;
  recordId: string;
  title: string;
  ticketStatus?: string;
  sharedUrl?: string;
  createdTime?: string;
  sourceFields?: Record<string, unknown>;
  ticketNumber?: string;
  issueType?: string;
  requester?: string;
  responsible?: string;
  priority?: string;
  detailDescription?: string;
  meegleLink?: string;
  larkMessageLink?: string;
  ticketAi?: LarkTicketAiData;
  sourceUpdatedAt?: string;
  syncedAt: string;
}

export interface LarkBaseTicketListFilters {
  createdAfter?: string;
  createdBefore?: string;
  sourceUpdatedAtAfter?: string;
  sourceUpdatedAtBefore?: string;
  issueTypes?: string[];
  statuses?: string[];
  priorities?: string[];
  responsibles?: string[];
  quickFilter?: "in-progress" | "unclassified" | "unsynced";
  offset?: number;
}

export interface MeegleWorkitemListFilters {
  sprints?: string[];
  statuses?: string[];
  projects?: string[];
  priorities?: string[];
  workitemTypes?: string[];
  withoutSprint?: boolean;
  sourceUpdatedAtAfter?: string;
  sourceUpdatedAtBefore?: string;
  offset?: number;
}

export interface GitHubPullRequestListFilters {
  statuses?: string[];
  repositories?: string[];
  labels?: string[];
  reviewers?: string[];
  sourceUpdatedAtAfter?: string;
  sourceUpdatedAtBefore?: string;
  offset?: number;
}

export class PostgresPlatformSyncStore implements PlatformSyncStore {
  constructor(private readonly db: Kysely<DatabaseSchema> = getSharedDatabase()) {}

  async upsertMeegleWorkitem(input: {
    projectKey: string;
    workItemTypeKey: string;
    workitem: MeegleWorkitem;
    sprintRelation?: MeegleSprintRelationFields;
    sprintObservedAt?: string;
    lifecycle?: MeegleWorkitemLifecycleFields;
  }): Promise<void> {
    const now = new Date().toISOString();
    const sourceUpdatedAt = input.workitem.updatedAt ?? null;
    await this.db.transaction().execute(async (trx) => {
      const existing = await trx.selectFrom("meegle_workitem_syncs")
        .select(["sprint_id", "sprint", "add_to_cycle_time", "current_node_start_time", "item_start_time", "item_finish_time"])
        .where("project_key", "=", input.projectKey)
        .where("work_item_type_key", "=", input.workItemTypeKey)
        .where("work_item_id", "=", input.workitem.id)
        .forUpdate()
        .executeTakeFirst();
      const openMembership = input.sprintObservedAt
        ? await trx.selectFrom("meegle_workitem_sprint_memberships")
          .select(["sprint_id", "added_at", "started_at", "finished_at", "source"])
          .where("project_key", "=", input.projectKey)
          .where("work_item_type_key", "=", input.workItemTypeKey)
          .where("work_item_id", "=", input.workitem.id)
          .where("removed_at", "is", null)
          .forUpdate()
          .executeTakeFirst()
        : undefined;
      const membershipTransition = input.sprintObservedAt
        ? projectMeegleSprintMembershipTransition({
          currentSnapshot: existing ? {
            sprintId: existing.sprint_id,
            sprintName: existing.sprint,
            addToCycleTime: existing.add_to_cycle_time,
            itemStartTime: existing.item_start_time,
            itemFinishTime: existing.item_finish_time,
          } : undefined,
          openMembership: openMembership ? {
            sprintId: openMembership.sprint_id,
            addedAt: openMembership.added_at,
            startedAt: openMembership.started_at,
            finishedAt: openMembership.finished_at,
            source: openMembership.source,
          } : undefined,
          relation: input.sprintRelation,
          lifecycle: input.lifecycle,
          observedAt: input.sprintObservedAt,
        })
        : undefined;
      const sprint = projectMeegleSprintMembership(
        existing,
        input.sprintRelation,
        input.lifecycle?.addToCycleTime,
        now,
        input.sprintObservedAt,
      );
      const projectedLifecycle = projectMeegleIncrementalLifecycle(existing, input.lifecycle);
      const currentNodeStartTime = input.lifecycle?.currentNodeStartTime === undefined
        ? existing?.current_node_start_time ?? null
        : input.lifecycle.currentNodeStartTime;
      const itemStartTime = membershipTransition?.currentOpen
        ? membershipTransition.currentOpen.startedAt
        : projectedLifecycle.itemStartTime;
      const itemFinishTime = membershipTransition?.currentOpen
        ? membershipTransition.currentOpen.finishedAt
        : projectedLifecycle.itemFinishTime;

      if (membershipTransition?.closeOpenAt) {
        await trx.updateTable("meegle_workitem_sprint_memberships").set({
          removed_at: membershipTransition.closeOpenAt,
          updated_at: now,
        }).where("project_key", "=", input.projectKey)
          .where("work_item_type_key", "=", input.workItemTypeKey)
          .where("work_item_id", "=", input.workitem.id)
          .where("removed_at", "is", null)
          .execute();
      }
      if (membershipTransition?.updateOpen) {
        await trx.updateTable("meegle_workitem_sprint_memberships").set({
          started_at: membershipTransition.updateOpen.startedAt,
          finished_at: membershipTransition.updateOpen.finishedAt,
          updated_at: now,
        }).where("project_key", "=", input.projectKey)
          .where("work_item_type_key", "=", input.workItemTypeKey)
          .where("work_item_id", "=", input.workitem.id)
          .where("sprint_id", "=", membershipTransition.updateOpen.sprintId)
          .where("added_at", "=", membershipTransition.updateOpen.addedAt)
          .where("removed_at", "is", null)
          .execute();
      }
      const membershipsToCreate = [
        membershipTransition?.createClosed
          ? { ...membershipTransition.createClosed, removedAt: membershipTransition.createClosed.removedAt }
          : undefined,
        membershipTransition?.createOpen
          ? { ...membershipTransition.createOpen, removedAt: null }
          : undefined,
      ];
      for (const membership of membershipsToCreate) {
        if (!membership) continue;
        await trx.insertInto("meegle_workitem_sprint_memberships").values({
          project_key: input.projectKey,
          work_item_type_key: input.workItemTypeKey,
          work_item_id: input.workitem.id,
          sprint_id: membership.sprintId,
          added_at: membership.addedAt,
          started_at: membership.startedAt,
          finished_at: membership.finishedAt,
          removed_at: membership.removedAt,
          source: membership.source,
          created_at: now,
          updated_at: now,
        }).execute();
      }

      await trx.insertInto("meegle_workitem_syncs").values({
        project_key: input.projectKey,
        work_item_type_key: input.workItemTypeKey,
        work_item_id: input.workitem.id,
        work_item_key: input.workitem.key || null,
        title: input.workitem.name,
        work_item_type: input.workitem.workItemType ?? null,
        status_key: input.workitem.statusKey ?? null,
        status: input.workitem.status || null,
        sub_stage_key: input.workitem.subStageKey ?? null,
        sub_stage: input.workitem.subStage ?? null,
        assignee: input.workitem.assignee ?? null,
        priority: input.workitem.priority ?? null,
        sprint_id: sprint.sprintId,
        sprint: sprint.sprintName,
        add_to_cycle_time: membershipTransition?.currentOpen?.addedAt ?? sprint.addToCycleTime,
        current_node_start_time: currentNodeStartTime,
        item_start_time: itemStartTime,
        item_finish_time: itemFinishTime,
        created_at: input.workitem.createdAt ?? null,
        payload_json: JSON.stringify(input.workitem),
        source_updated_at: sourceUpdatedAt,
        synced_at: now,
        last_seen_at: now,
        stale: false,
      }).onConflict((conflict) => conflict.columns([
        "project_key",
        "work_item_type_key",
        "work_item_id",
      ]).doUpdateSet({
        work_item_key: input.workitem.key || null,
        title: input.workitem.name,
        work_item_type: input.workitem.workItemType ?? null,
        status_key: input.workitem.statusKey ?? null,
        status: input.workitem.status || null,
        sub_stage_key: input.workitem.subStageKey ?? null,
        sub_stage: input.workitem.subStage ?? null,
        assignee: input.workitem.assignee ?? null,
        priority: input.workitem.priority ?? null,
        sprint_id: sprint.sprintId,
        sprint: sprint.sprintName,
        add_to_cycle_time: membershipTransition?.currentOpen?.addedAt ?? sprint.addToCycleTime,
        current_node_start_time: currentNodeStartTime,
        item_start_time: itemStartTime,
        item_finish_time: itemFinishTime,
        created_at: input.workitem.createdAt ?? null,
        payload_json: JSON.stringify(input.workitem),
        source_updated_at: sourceUpdatedAt,
        synced_at: now,
        last_seen_at: now,
        stale: false,
      })).execute();
    });
  }

  async upsertMeegleMappings(mappings: MeegleSyncMapping[]): Promise<void> {
    if (mappings.length === 0) {
      return;
    }
    const now = new Date().toISOString();
    for (const mapping of mappings) {
      await this.db.insertInto("meegle_sync_mappings").values({
        project_key: mapping.projectKey,
        work_item_type_key: mapping.workItemTypeKey,
        mapping_kind: mapping.kind,
        source_key: mapping.sourceKey,
        display_value: mapping.displayValue,
        synced_at: now,
      }).onConflict((conflict) => conflict.columns([
        "project_key",
        "work_item_type_key",
        "mapping_kind",
        "source_key",
      ]).doUpdateSet({
        display_value: mapping.displayValue,
        synced_at: now,
      })).execute();
    }
  }

  async upsertGitHubPullRequest(input: {
    owner: string;
    repo: string;
    pullRequest: GitHubPrDetails;
  }): Promise<void> {
    const now = new Date().toISOString();
    const meegleIds = extractMeegleIds(input.pullRequest.title, input.pullRequest.body);
    await this.db.insertInto("github_pr_syncs").values({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.pullRequest.number,
      title: input.pullRequest.title,
      description: input.pullRequest.body ?? null,
      state: input.pullRequest.state || "open",
      merged_at: input.pullRequest.merged_at ?? null,
      html_url: input.pullRequest.html_url,
      author_login: input.pullRequest.user?.login ?? null,
      head_ref: input.pullRequest.head?.ref ?? null,
      base_ref: input.pullRequest.base?.ref ?? null,
      is_draft: input.pullRequest.draft ?? false,
      meegle_ids: JSON.stringify(meegleIds),
      payload_json: JSON.stringify(input.pullRequest),
      source_updated_at: input.pullRequest.updated_at ?? null,
      synced_at: now,
      last_seen_at: now,
      stale: false,
    }).onConflict((conflict) => conflict.columns(["owner", "repo", "pull_number"])
      .doUpdateSet({
        title: input.pullRequest.title,
        description: input.pullRequest.body ?? null,
        state: input.pullRequest.state || "open",
        merged_at: input.pullRequest.merged_at ?? null,
        html_url: input.pullRequest.html_url,
        author_login: input.pullRequest.user?.login ?? null,
        head_ref: input.pullRequest.head?.ref ?? null,
        base_ref: input.pullRequest.base?.ref ?? null,
        is_draft: input.pullRequest.draft ?? false,
        meegle_ids: JSON.stringify(meegleIds),
        payload_json: JSON.stringify(input.pullRequest),
        source_updated_at: input.pullRequest.updated_at ?? null,
        synced_at: now,
        last_seen_at: now,
        stale: false,
      })).execute();
  }

  async upsertLarkBaseTicket(input: LarkBaseTicketUpsertInput): Promise<void> {
    await this.upsertLarkBaseTickets([input]);
  }

  async upsertLarkBaseTickets(inputs: LarkBaseTicketUpsertInput[]): Promise<void> {
    for (const batch of chunks(inputs, 500)) {
      const now = new Date().toISOString();
      await this.db.insertInto("lark_base_ticket_syncs").values(batch.map((input) => ({
        base_id: input.baseId,
        table_id: input.tableId,
        record_id: input.record.record_id,
        title: input.title,
        ticket_status: input.status ?? null,
        fields_json: JSON.stringify(input.record.fields),
        created_time: input.record.created_time ?? null,
        source_updated_at: input.record.updated_time ?? null,
        synced_at: now,
        last_seen_at: now,
        stale: false,
      }))).onConflict((conflict) => conflict.columns(["base_id", "table_id", "record_id"])
        .doUpdateSet((eb) => ({
          title: eb.ref("excluded.title"),
          ticket_status: eb.ref("excluded.ticket_status"),
          fields_json: eb.ref("excluded.fields_json"),
          created_time: eb.ref("excluded.created_time"),
          source_updated_at: eb.ref("excluded.source_updated_at"),
          synced_at: eb.ref("excluded.synced_at"),
          last_seen_at: eb.ref("excluded.last_seen_at"),
          stale: false,
        }))).execute();

      const sharedUrls = batch.filter((input) => input.record.shared_url);
      if (sharedUrls.length > 0) {
        await this.db.insertInto("lark_base_ticket_octo").values(sharedUrls.map((input) => ({
          base_id: input.baseId,
          table_id: input.tableId,
          record_id: input.record.record_id,
          shared_url: input.record.shared_url!,
          ticket_ai: "{}",
          local_json: "{}",
          created_at: now,
          updated_at: now,
        }))).onConflict((conflict) => conflict.columns(["base_id", "table_id", "record_id"])
          .doUpdateSet((eb) => ({
            shared_url: eb.ref("excluded.shared_url"),
            updated_at: eb.ref("excluded.updated_at"),
          }))).execute();
      }
    }
  }

  async setLarkBaseTicketSharedUrl(input: {
    baseId: string;
    tableId: string;
    recordId: string;
    sharedUrl: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insertInto("lark_base_ticket_octo").values({
      base_id: input.baseId,
      table_id: input.tableId,
      record_id: input.recordId,
      shared_url: input.sharedUrl,
      ticket_ai: "{}",
      local_json: "{}",
      created_at: now,
      updated_at: now,
    }).onConflict((conflict) => conflict.columns(["base_id", "table_id", "record_id"])
      .doUpdateSet({
        shared_url: input.sharedUrl,
        updated_at: now,
      })).execute();
  }

  async upsertLarkBaseTicketAi(input: LarkBaseTicketSyncRef & { fields: LarkTicketAiFields }): Promise<boolean> {
    const fields = pickLarkTicketAiFields(input.fields);
    if (!Object.keys(fields).length) return false;
    const existing = await this.db.selectFrom("lark_base_ticket_octo")
      .select("ticket_ai")
      .where("base_id", "=", input.baseId)
      .where("table_id", "=", input.tableId)
      .where("record_id", "=", input.recordId)
      .executeTakeFirst();
    const current = parseLarkTicketAiData(existing?.ticket_ai);
    const mergedFields = { ...current?.fields, ...fields };
    if (current && JSON.stringify(current.fields) === JSON.stringify(mergedFields)) return false;
    const now = new Date().toISOString();
    await this.db.insertInto("lark_base_ticket_octo").values({
      base_id: input.baseId,
      table_id: input.tableId,
      record_id: input.recordId,
      shared_url: null,
      ticket_ai: JSON.stringify({ fields: mergedFields, updatedAt: now }),
      local_json: "{}",
      created_at: now,
      updated_at: now,
    }).onConflict((conflict) => conflict.columns(["base_id", "table_id", "record_id"])
      .doUpdateSet({ ticket_ai: JSON.stringify({ fields: mergedFields, updatedAt: now }), updated_at: now }))
      .execute();
    return true;
  }

  async findLarkBaseTicketByRecordId(recordId: string): Promise<LarkBaseTicketSyncRef | undefined> {
    const rows = await this.db.selectFrom("lark_base_ticket_syncs")
      .select(["base_id", "table_id", "record_id"])
      .where("record_id", "=", recordId)
      .limit(2)
      .execute();
    if (rows.length !== 1) return undefined;
    return { baseId: rows[0].base_id, tableId: rows[0].table_id, recordId: rows[0].record_id };
  }

  async getMeegleWorkitemsForCleaning(refs: MeegleWorkitemSyncRef[]): Promise<MeegleWorkitemSyncItem[]> {
    const results: MeegleWorkitemSyncItem[] = [];
    for (const ref of refs) {
      const row = await this.db.selectFrom("meegle_workitem_syncs")
        .select([
          "project_key", "project_name", "work_item_type_key", "work_item_id", "work_item_key", "title",
          "work_item_type", "status_key", "status", "sub_stage_key", "sub_stage", "sprint_id", "sprint", "version",
          "system", "bugs_json", "assignee", "priority", "source_updated_at", "synced_at", "payload_json",
          "add_to_cycle_time", "current_node_start_time", "item_start_time", "item_finish_time", "created_at",
        ])
        .where("project_key", "=", ref.projectKey)
        .where("work_item_type_key", "=", ref.workItemTypeKey)
        .where("work_item_id", "=", ref.workItemId)
        .executeTakeFirst();
      if (row) {
        results.push(toMeegleWorkitemSyncItem(row));
      }
    }
    return results;
  }

  async getGitHubPullRequestsForCleaning(refs: GitHubPullRequestSyncRef[]): Promise<GitHubPullRequestSyncItem[]> {
    const results: GitHubPullRequestSyncItem[] = [];
    for (const ref of refs) {
      const row = await this.db.selectFrom("github_pr_syncs")
        .select([
          "owner", "repo", "pull_number", "title", "description", "state", "merged_at", "html_url", "author_login", "merged_by_login",
          "head_ref", "base_ref", "is_draft", "meegle_ids", "reviewers_json", "labels_json", "created_at",
          "source_updated_at", "synced_at", "payload_json",
        ])
        .where("owner", "=", ref.owner)
        .where("repo", "=", ref.repo)
        .where("pull_number", "=", ref.pullNumber)
        .executeTakeFirst();
      if (row) {
        results.push(toGitHubPullRequestSyncItem(row));
      }
    }
    return results;
  }

  async getLarkBaseTicketsForCleaning(refs: LarkBaseTicketSyncRef[]): Promise<LarkBaseTicketSyncItem[]> {
    const results: LarkBaseTicketSyncItem[] = [];
    for (const batch of chunks(uniqueLarkRefs(refs), 500)) {
      if (batch.length === 0) continue;
      const rows = await this.db.selectFrom("lark_base_ticket_syncs as sync")
        .leftJoin("lark_base_ticket_octo as octo", (join) => join
          .onRef("octo.base_id", "=", "sync.base_id")
          .onRef("octo.table_id", "=", "sync.table_id")
          .onRef("octo.record_id", "=", "sync.record_id"))
        .select([
          "sync.base_id", "sync.table_id", "sync.record_id", "sync.title", "sync.ticket_status", "sync.created_time",
          "sync.ticket_number", "sync.issue_type", "sync.requester", "sync.responsible", "sync.priority", "sync.detail_description", "sync.meegle_link", "sync.lark_message_link",
          "sync.source_updated_at", "sync.synced_at", "sync.fields_json", "octo.shared_url as octo_shared_url", "octo.ticket_ai as octo_ticket_ai",
        ])
        .where((eb) => eb.or(batch.map((ref) => eb.and([
          eb("sync.base_id", "=", ref.baseId),
          eb("sync.table_id", "=", ref.tableId),
          eb("sync.record_id", "=", ref.recordId),
        ]))))
        .execute();
      results.push(...rows.map(toLarkBaseTicketSyncItem));
    }
    return results;
  }

  async applyMeegleWorkitemCleaning(input: MeegleWorkitemCleaningInput): Promise<boolean> {
    const existing = await this.db.selectFrom("meegle_workitem_syncs")
      .select(["sprint_id", "sprint", "version", "system", "bugs_json", "add_to_cycle_time", "current_node_start_time", "item_start_time", "item_finish_time"])
      .where("project_key", "=", input.projectKey)
      .where("work_item_type_key", "=", input.workItemTypeKey)
      .where("work_item_id", "=", input.workItemId)
      .executeTakeFirst();
    const sprint = projectMeegleSprintMembership(existing, input.sprintRelation, input.lifecycle?.addToCycleTime, input.observedAt);
    const itemStartTime = input.lifecycle?.itemStartTime === undefined
      ? existing?.item_start_time ?? null
      : input.lifecycle.itemStartTime;
    const itemFinishTime = input.lifecycle?.itemFinishTime === undefined
      ? existing?.item_finish_time ?? null
      : input.lifecycle.itemFinishTime;
    const currentNodeStartTime = input.lifecycle?.currentNodeStartTime === undefined
      ? existing?.current_node_start_time ?? null
      : input.lifecycle.currentNodeStartTime;
    const bugsJson = JSON.stringify(input.bugs);
    if (existing && existing.sprint_id === sprint.sprintId && existing.sprint === sprint.sprintName
      && existing.add_to_cycle_time === sprint.addToCycleTime && existing.item_start_time === itemStartTime
      && existing.item_finish_time === itemFinishTime && existing.current_node_start_time === currentNodeStartTime
      && existing.version === input.version
      && existing.system === input.system && existing.bugs_json === bugsJson) return false;
    await this.db.updateTable("meegle_workitem_syncs").set({
      sprint_id: sprint.sprintId,
      sprint: sprint.sprintName,
      add_to_cycle_time: sprint.addToCycleTime,
      current_node_start_time: currentNodeStartTime,
      item_start_time: itemStartTime,
      item_finish_time: itemFinishTime,
      version: input.version ?? null,
      system: input.system ?? null,
      bugs_json: bugsJson,
    }).where("project_key", "=", input.projectKey)
      .where("work_item_type_key", "=", input.workItemTypeKey)
      .where("work_item_id", "=", input.workItemId)
      .execute();
    return true;
  }

  async applyGitHubPullRequestCleaning(input: GitHubPullRequestCleaningInput): Promise<boolean> {
    const existing = await this.db.selectFrom("github_pr_syncs")
      .select(["author_login", "merged_by_login", "reviewers_json", "labels_json", "created_at"])
      .where("owner", "=", input.owner).where("repo", "=", input.repo).where("pull_number", "=", input.pullNumber)
      .executeTakeFirst();
    const reviewersJson = JSON.stringify(input.reviewers);
    const labelsJson = JSON.stringify(input.labels);
    if (existing && existing.author_login === input.author && existing.merged_by_login === input.mergedBy && existing.reviewers_json === reviewersJson
      && existing.labels_json === labelsJson && existing.created_at === input.createdAt) return false;
    await this.db.updateTable("github_pr_syncs").set({
      author_login: input.author ?? null,
      merged_by_login: input.mergedBy ?? null,
      reviewers_json: reviewersJson,
      labels_json: labelsJson,
      created_at: input.createdAt ?? null,
    }).where("owner", "=", input.owner).where("repo", "=", input.repo).where("pull_number", "=", input.pullNumber)
      .execute();
    return true;
  }

  async applyLarkBaseTicketCleaning(input: LarkBaseTicketCleaningInput): Promise<boolean> {
    return (await this.applyLarkBaseTicketCleanings([input])) > 0;
  }

  async applyLarkBaseTicketCleanings(inputs: LarkBaseTicketCleaningInput[]): Promise<number> {
    let cleaned = 0;
    for (const batch of chunks(inputs, 500)) {
      const values = batch.map((input) => sql`(
        ${input.baseId}::text,
        ${input.tableId}::text,
        ${input.recordId}::text,
        ${input.ticketNumber ?? null}::text,
        ${input.issueType ?? null}::text,
        ${input.requester ?? null}::text,
        ${input.responsible ?? null}::text,
        ${input.priority ?? null}::text,
        ${input.detailDescription ?? null}::text,
        ${input.meegleLink ?? null}::text,
        ${input.larkMessageLink ?? null}::text
      )`);
      const result = await sql`
        UPDATE lark_base_ticket_syncs
        SET
          ticket_number = source.ticket_number,
          issue_type = source.issue_type,
          requester = source.requester,
          responsible = source.responsible,
          priority = source.priority,
          detail_description = source.detail_description,
          meegle_link = source.meegle_link,
          lark_message_link = source.lark_message_link
        FROM (VALUES ${sql.join(values)}) AS source(
          base_id, table_id, record_id, ticket_number, issue_type, requester,
          responsible, priority, detail_description, meegle_link, lark_message_link
        )
        WHERE lark_base_ticket_syncs.base_id = source.base_id
          AND lark_base_ticket_syncs.table_id = source.table_id
          AND lark_base_ticket_syncs.record_id = source.record_id
          AND (
            lark_base_ticket_syncs.ticket_number <> source.ticket_number
            OR (lark_base_ticket_syncs.ticket_number IS NULL AND source.ticket_number IS NOT NULL)
            OR (lark_base_ticket_syncs.ticket_number IS NOT NULL AND source.ticket_number IS NULL)
            OR lark_base_ticket_syncs.issue_type <> source.issue_type
            OR (lark_base_ticket_syncs.issue_type IS NULL AND source.issue_type IS NOT NULL)
            OR (lark_base_ticket_syncs.issue_type IS NOT NULL AND source.issue_type IS NULL)
            OR lark_base_ticket_syncs.requester <> source.requester
            OR (lark_base_ticket_syncs.requester IS NULL AND source.requester IS NOT NULL)
            OR (lark_base_ticket_syncs.requester IS NOT NULL AND source.requester IS NULL)
            OR lark_base_ticket_syncs.responsible <> source.responsible
            OR (lark_base_ticket_syncs.responsible IS NULL AND source.responsible IS NOT NULL)
            OR (lark_base_ticket_syncs.responsible IS NOT NULL AND source.responsible IS NULL)
            OR lark_base_ticket_syncs.priority <> source.priority
            OR (lark_base_ticket_syncs.priority IS NULL AND source.priority IS NOT NULL)
            OR (lark_base_ticket_syncs.priority IS NOT NULL AND source.priority IS NULL)
            OR lark_base_ticket_syncs.detail_description <> source.detail_description
            OR (lark_base_ticket_syncs.detail_description IS NULL AND source.detail_description IS NOT NULL)
            OR (lark_base_ticket_syncs.detail_description IS NOT NULL AND source.detail_description IS NULL)
            OR lark_base_ticket_syncs.meegle_link <> source.meegle_link
            OR (lark_base_ticket_syncs.meegle_link IS NULL AND source.meegle_link IS NOT NULL)
            OR (lark_base_ticket_syncs.meegle_link IS NOT NULL AND source.meegle_link IS NULL)
            OR lark_base_ticket_syncs.lark_message_link <> source.lark_message_link
            OR (lark_base_ticket_syncs.lark_message_link IS NULL AND source.lark_message_link IS NOT NULL)
            OR (lark_base_ticket_syncs.lark_message_link IS NOT NULL AND source.lark_message_link IS NULL)
          )
      `.execute(this.db);
      cleaned += Number(result.numAffectedRows ?? 0);
    }
    return cleaned;
  }

  async markMeegleWorkitemsUnseenStale(projectKey: string, seenSince: string, workItemTypeKey?: string): Promise<number> {
    let query = this.db.updateTable("meegle_workitem_syncs")
      .set({ stale: true })
      .where("project_key", "=", projectKey)
      .where("stale", "=", false)
      .where((eb) => eb.or([eb("last_seen_at", "is", null), eb("last_seen_at", "<", seenSince)]));
    if (workItemTypeKey) query = query.where("work_item_type_key", "=", workItemTypeKey);
    const result = await query.executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async markGitHubPullRequestsUnseenStale(owner: string, repo: string, seenSince: string): Promise<number> {
    const result = await this.db.updateTable("github_pr_syncs")
      .set({ stale: true })
      .where("owner", "=", owner)
      .where("repo", "=", repo)
      .where("stale", "=", false)
      .where((eb) => eb.or([eb("last_seen_at", "is", null), eb("last_seen_at", "<", seenSince)]))
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async markLarkBaseTicketsUnseenStale(baseId: string, tableId: string, seenSince: string): Promise<number> {
    const result = await this.db.updateTable("lark_base_ticket_syncs")
      .set({ stale: true })
      .where("base_id", "=", baseId)
      .where("table_id", "=", tableId)
      .where("stale", "=", false)
      .where((eb) => eb.or([eb("last_seen_at", "is", null), eb("last_seen_at", "<", seenSince)]))
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async listMeegleWorkitems(limit: number, filters: MeegleWorkitemListFilters = {}): Promise<MeegleWorkitemSyncItem[]> {
    const rows = await this.filteredMeegleWorkitems(filters)
      .select([
        "project_key", "project_name", "work_item_type_key", "work_item_id", "work_item_key", "title",
        "work_item_type", "status_key", "status", "sub_stage_key", "sub_stage",
        "sprint_id", "sprint", "version", "system", "bugs_json",
        "assignee", "priority", "source_updated_at", "synced_at",
        "add_to_cycle_time", "current_node_start_time", "item_start_time", "item_finish_time", "created_at",
      ])
      .orderBy("source_updated_at", "desc")
      .orderBy("synced_at", "desc")
      .offset(filters.offset ?? 0)
      .limit(limit)
      .execute();

    return rows.map(toMeegleWorkitemSyncItem);
  }

  async countMeegleWorkitems(filters: MeegleWorkitemListFilters = {}): Promise<number> {
    const row = await this.filteredMeegleWorkitems(filters)
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }

  private filteredMeegleWorkitems(filters: MeegleWorkitemListFilters) {
    let query = this.db.selectFrom("meegle_workitem_syncs")
      .where("work_item_type_key", "not in", MEEGLE_SPRINT_TYPE_KEYS);
    if (filters.sprints?.length) query = query.where("sprint", "in", filters.sprints);
    if (filters.statuses?.length) {
      const configuredStatuses = filters.statuses.filter((status) => status !== "未设置");
      query = query.where((eb) => eb.or([
        ...(configuredStatuses.length ? [eb("status", "in", configuredStatuses)] : []),
        ...(filters.statuses!.includes("未设置") ? [eb("status", "is", null), eb("status", "=", "")] : []),
      ]));
    }
    if (filters.projects?.length) query = query.where((eb) => eb.or([
      eb("project_key", "in", filters.projects!),
      eb("project_name", "in", filters.projects!),
    ]));
    if (filters.priorities?.length) query = query.where("priority", "in", filters.priorities);
    if (filters.sourceUpdatedAtAfter) query = query.where("source_updated_at", ">=", filters.sourceUpdatedAtAfter);
    if (filters.sourceUpdatedAtBefore) query = query.where("source_updated_at", "<=", filters.sourceUpdatedAtBefore);
    if (filters.withoutSprint) query = query.where((eb) => eb.or([eb("sprint", "is", null), eb("sprint", "=", "")]));
    if (filters.workitemTypes?.length) {
      query = query.where((eb) => eb.or(filters.workitemTypes!.map((type) => {
        if (type === "story") return eb("work_item_type_key", "=", "story");
        if (type === "bug") return sql<boolean>`lower(coalesce(work_item_type, '') || ' ' || work_item_type_key) like '%bug%'`;
        return sql<boolean>`lower(coalesce(work_item_type, '') || ' ' || work_item_type_key) like '%tech task%'`;
      })));
    }
    return query;
  }

  async listMeegleSprints(): Promise<string[]> {
    const [relationRows, sprintRows] = await Promise.all([
      this.db.selectFrom("meegle_workitem_syncs")
        .select("sprint")
        .where("sprint", "is not", null)
        .distinct()
        .execute(),
      this.db.selectFrom("meegle_workitem_syncs")
        .select("title")
        .where("work_item_type_key", "in", MEEGLE_SPRINT_TYPE_KEYS)
        .execute(),
    ]);
    return [...new Set([
      ...relationRows.map((row) => row.sprint).filter((sprint): sprint is string => sprint !== null),
      ...sprintRows.map((row) => row.title),
    ])].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
  }

  async listMeegleSprintSnapshots(): Promise<MeegleWorkitemSyncItem[]> {
    const rows = await this.db.selectFrom("meegle_workitem_syncs")
      .select([
        "project_key", "project_name", "work_item_type_key", "work_item_id", "work_item_key", "title",
        "work_item_type", "status_key", "status", "sub_stage_key", "sub_stage",
        "sprint_id", "sprint", "version", "system", "bugs_json", "assignee", "priority",
        "source_updated_at", "synced_at", "payload_json",
        "add_to_cycle_time", "current_node_start_time", "item_start_time", "item_finish_time", "created_at",
      ])
      .where("work_item_type_key", "in", MEEGLE_SPRINT_TYPE_KEYS)
      .orderBy("source_updated_at", "desc")
      .orderBy("synced_at", "desc")
      .execute();
    return rows.map(toMeegleWorkitemSyncItem);
  }

  async listMeegleSprintMemberships(): Promise<MeegleSprintMembershipSyncItem[]> {
    const [rows, currentRows] = await Promise.all([
      this.db.selectFrom("meegle_workitem_sprint_memberships as membership")
        .innerJoin("meegle_workitem_syncs as workitem", (join) => join
          .onRef("workitem.project_key", "=", "membership.project_key")
          .onRef("workitem.work_item_type_key", "=", "membership.work_item_type_key")
          .onRef("workitem.work_item_id", "=", "membership.work_item_id"))
        .select([
          "workitem.project_key as project_key", "workitem.project_name as project_name",
          "workitem.work_item_type_key as work_item_type_key", "workitem.work_item_id as work_item_id",
          "workitem.work_item_key as work_item_key", "workitem.title as title",
          "workitem.work_item_type as work_item_type", "workitem.status_key as status_key",
          "workitem.status as status", "workitem.sub_stage_key as sub_stage_key",
          "workitem.sub_stage as sub_stage", "workitem.sprint_id as sprint_id",
          "workitem.sprint as sprint", "workitem.version as version", "workitem.system as system",
          "workitem.bugs_json as bugs_json", "workitem.assignee as assignee",
          "workitem.priority as priority", "workitem.add_to_cycle_time as add_to_cycle_time",
          "workitem.payload_json as payload_json",
          "workitem.current_node_start_time as current_node_start_time",
          "workitem.item_start_time as item_start_time", "workitem.item_finish_time as item_finish_time",
          "workitem.created_at as created_at",
          "workitem.source_updated_at as source_updated_at", "workitem.synced_at as synced_at",
          "membership.sprint_id as membership_sprint_id", "membership.added_at as membership_added_at",
          "membership.started_at as membership_started_at", "membership.finished_at as membership_finished_at",
          "membership.removed_at as membership_removed_at", "membership.source as membership_source",
        ])
        .where("workitem.work_item_type_key", "not in", MEEGLE_SPRINT_TYPE_KEYS)
        .orderBy("membership.project_key")
        .orderBy("membership.work_item_type_key")
        .orderBy("membership.work_item_id")
        .orderBy("membership.added_at")
        .execute(),
      this.db.selectFrom("meegle_workitem_syncs")
        .select([
          "project_key", "project_name", "work_item_type_key", "work_item_id", "work_item_key", "title",
          "work_item_type", "status_key", "status", "sub_stage_key", "sub_stage",
          "sprint_id", "sprint", "version", "system", "bugs_json", "assignee", "priority",
          "payload_json",
          "source_updated_at", "synced_at", "add_to_cycle_time", "current_node_start_time",
          "item_start_time", "item_finish_time", "created_at",
        ])
        .where("work_item_type_key", "not in", MEEGLE_SPRINT_TYPE_KEYS)
        .where("sprint_id", "is not", null)
        .execute(),
    ]);

    const memberships = rows.map((row) => {
      const current = toMeegleWorkitemSyncItem(row);
      const { sprintId: _currentSprintId, sprint: _currentSprint, addToCycleTime: _currentAddedAt,
        itemStartTime: _currentStartedAt, itemFinishTime: _currentFinishedAt, ...workitem } = current;
      return {
        ...workitem,
        sprintId: row.membership_sprint_id,
        addToCycleTime: row.membership_added_at,
        ...(row.membership_started_at ? { itemStartTime: row.membership_started_at } : {}),
        ...(row.membership_finished_at ? { itemFinishTime: row.membership_finished_at } : {}),
        ...(row.membership_removed_at ? { membershipRemovedAt: row.membership_removed_at } : {}),
        membershipSource: row.membership_source,
      };
    });
    const openMembershipKeys = new Set(memberships
      .filter((membership) => !membership.membershipRemovedAt)
      .map((membership) => meegleSprintMembershipKey(membership)));
    const inferredCurrentMemberships = currentRows.flatMap((row) => {
      const current = toMeegleWorkitemSyncItem(row);
      const sprintId = current.sprintId;
      if (!sprintId || openMembershipKeys.has(meegleSprintMembershipKey(current))) return [];
      return [{ ...current, sprintId, membershipSource: "historical_inferred" as const }];
    });
    return [...memberships, ...inferredCurrentMemberships];
  }

  async listMeegleWorkitemsByIds(workItemIds: string[]): Promise<MeegleWorkitemSyncItem[]> {
    const results: MeegleWorkitemSyncItem[] = [];
    for (const batch of chunks([...new Set(workItemIds)], 500)) {
      if (batch.length === 0) continue;
      const rows = await this.db.selectFrom("meegle_workitem_syncs")
        .select([
          "project_key", "project_name", "work_item_type_key", "work_item_id", "work_item_key", "title",
          "work_item_type", "status_key", "status", "sub_stage_key", "sub_stage",
          "sprint_id", "sprint", "version", "system", "bugs_json", "assignee", "priority",
          "source_updated_at", "synced_at", "add_to_cycle_time", "current_node_start_time", "item_start_time", "item_finish_time", "created_at",
        ])
        .where("work_item_id", "in", batch)
        .execute();
      results.push(...rows.map(toMeegleWorkitemSyncItem));
    }
    return results;
  }

  async listGitHubPullRequestLinks(meegleWorkItemIds: string[]): Promise<GitHubPullRequestLink[]> {
    const requestedIds = new Set(meegleWorkItemIds);
    if (requestedIds.size === 0) {
      return [];
    }

    const rows = await this.db.selectFrom("github_pr_syncs")
      .select([
        "owner", "repo", "pull_number", "title", "state", "merged_at", "html_url", "head_ref", "base_ref", "is_draft", "meegle_ids",
      ])
      .where("meegle_ids", "!=", "[]")
      .execute();

    return rows.flatMap((row) => (parseStringArray(row.meegle_ids) ?? [])
      .filter((meegleId) => requestedIds.has(meegleId))
      .map((meegleId) => ({
        meegleId,
        owner: row.owner,
        repo: row.repo,
        pullNumber: row.pull_number,
        title: row.title,
        htmlUrl: row.html_url,
        headRef: row.head_ref ?? undefined,
        baseRef: row.base_ref ?? undefined,
        state: row.merged_at ? "merged" : row.state,
        isDraft: row.is_draft,
      })));
  }

  async findGitHubPullRequest(ref: GitHubPullRequestSyncRef): Promise<GitHubPullRequestSyncItem | undefined> {
    const row = await this.db.selectFrom("github_pr_syncs")
      .select([
        "owner", "repo", "pull_number", "title", "description", "state", "merged_at", "html_url", "author_login", "merged_by_login",
        "head_ref", "base_ref", "is_draft", "meegle_ids", "reviewers_json", "labels_json", "created_at",
        "source_updated_at", "synced_at",
      ])
      .where("owner", "=", ref.owner)
      .where("repo", "=", ref.repo)
      .where("pull_number", "=", ref.pullNumber)
      .executeTakeFirst();
    return row ? toGitHubPullRequestSyncItem(row) : undefined;
  }

  async listGitHubPullRequests(limit: number, filters: GitHubPullRequestListFilters = {}): Promise<GitHubPullRequestSyncItem[]> {
    const rows = await this.filteredGitHubPullRequests(filters)
      .select([
        "owner", "repo", "pull_number", "title", "state", "merged_at", "html_url", "author_login", "merged_by_login",
        "head_ref", "base_ref", "is_draft", "meegle_ids", "reviewers_json", "labels_json", "created_at",
        "source_updated_at", "synced_at",
      ])
      .orderBy("source_updated_at", "desc")
      .orderBy("synced_at", "desc")
      .offset(filters.offset ?? 0)
      .limit(limit)
      .execute();

    return rows.map(toGitHubPullRequestSyncItem);
  }

  async countGitHubPullRequests(filters: GitHubPullRequestListFilters = {}): Promise<number> {
    const row = await this.filteredGitHubPullRequests(filters)
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }

  private filteredGitHubPullRequests(filters: GitHubPullRequestListFilters) {
    let query = this.db.selectFrom("github_pr_syncs");
    if (filters.statuses?.length) {
      query = query.where((eb) => eb.or(filters.statuses!.map((rawStatus) => {
        const status = rawStatus.toLocaleLowerCase();
        if (status === "draft") return eb("is_draft", "=", true);
        if (status === "merged") return eb.and([eb("is_draft", "=", false), eb("merged_at", "is not", null)]);
        return eb.and([
          eb("is_draft", "=", false),
          eb("state", "=", status),
          ...(status === "closed" ? [eb("merged_at", "is", null)] : []),
        ]);
      })));
    }
    if (filters.repositories?.length) {
      query = query.where(sql<string>`owner || ' / ' || repo`, "in", filters.repositories);
    }
    if (filters.labels?.length) {
      query = query.where((eb) => eb.or(filters.labels!.map((label) => sql<boolean>`coalesce(labels_json, '') like ${`%${JSON.stringify(label)}%`}`)));
    }
    if (filters.reviewers?.length) {
      query = query.where((eb) => eb.or(filters.reviewers!.map((reviewer) => sql<boolean>`coalesce(reviewers_json, '') like ${`%${JSON.stringify(reviewer)}%`}`)));
    }
    if (filters.sourceUpdatedAtAfter) query = query.where("source_updated_at", ">=", filters.sourceUpdatedAtAfter);
    if (filters.sourceUpdatedAtBefore) query = query.where("source_updated_at", "<=", filters.sourceUpdatedAtBefore);
    return query;
  }

  async listLarkBaseTickets(limit: number, filters: LarkBaseTicketListFilters = {}): Promise<LarkBaseTicketSyncItem[]> {
    const rows = await this.filteredLarkBaseTickets(filters)
      .select([
        "sync.base_id", "sync.table_id", "sync.record_id", "sync.title", "sync.ticket_status",
        "sync.created_time", "sync.ticket_number", "sync.issue_type", "sync.requester", "sync.responsible", "sync.priority", "sync.detail_description", "sync.meegle_link", "sync.lark_message_link",
        "sync.source_updated_at", "sync.synced_at", "sync.fields_json", "octo.shared_url as octo_shared_url", "octo.ticket_ai as octo_ticket_ai",
      ])
      .orderBy("sync.source_updated_at", "desc")
      .orderBy("sync.synced_at", "desc")
      .offset(filters.offset ?? 0)
      .limit(limit)
      .execute();

    return rows.map(toLarkBaseTicketSyncItem);
  }

  async countLarkBaseTickets(filters: LarkBaseTicketListFilters = {}): Promise<number> {
    const row = await this.filteredLarkBaseTickets(filters)
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }

  private filteredLarkBaseTickets(filters: LarkBaseTicketListFilters) {
    let query = this.db.selectFrom("lark_base_ticket_syncs as sync")
      .leftJoin("lark_base_ticket_octo as octo", (join) => join
        .onRef("octo.base_id", "=", "sync.base_id")
        .onRef("octo.table_id", "=", "sync.table_id")
        .onRef("octo.record_id", "=", "sync.record_id"));
    if (filters.createdAfter) query = query.where("sync.created_time", ">=", filters.createdAfter);
    if (filters.createdBefore) query = query.where("sync.created_time", "<=", filters.createdBefore);
    if (filters.sourceUpdatedAtAfter) query = query.where("sync.source_updated_at", ">=", filters.sourceUpdatedAtAfter);
    if (filters.sourceUpdatedAtBefore) query = query.where("sync.source_updated_at", "<=", filters.sourceUpdatedAtBefore);
    if (filters.issueTypes?.length) query = query.where("sync.issue_type", "in", filters.issueTypes);
    if (filters.statuses?.length) {
      const configuredStatuses = filters.statuses.filter((status) => status !== "未设置");
      query = query.where((eb) => eb.or([
        ...(configuredStatuses.length ? [eb("sync.ticket_status", "in", configuredStatuses)] : []),
        ...(filters.statuses!.includes("未设置") ? [eb("sync.ticket_status", "is", null), eb("sync.ticket_status", "=", "")] : []),
      ]));
    }
    if (filters.priorities?.length) query = query.where("sync.priority", "in", filters.priorities);
    if (filters.responsibles?.length) query = query.where((eb) => eb.or(filters.responsibles!.map((responsible) =>
      eb("sync.responsible", "like", `%${responsible}%`),
    )));
    if (filters.quickFilter === "in-progress") query = query.where(sql<boolean>`coalesce(lower(sync.ticket_status), '') not in ('finish', 'cancelled', 'rejected')`);
    if (filters.quickFilter === "unclassified") query = query.where(sql<boolean>`coalesce(sync.issue_type, '') = ''`);
    if (filters.quickFilter === "unsynced") query = query
      .where(sql<boolean>`lower(coalesce(sync.issue_type, '')) = 'feature'`)
      .where(sql<boolean>`coalesce(sync.meegle_link, '') = ''`);
    return query;
  }
}

type ExistingMeegleSprintMembership = {
  sprint_id: string | null;
  sprint: string | null;
  add_to_cycle_time: string | null;
} | undefined;

function meegleSprintMembershipKey(item: Pick<MeegleWorkitemSyncItem, "projectKey" | "workItemTypeKey" | "workItemId" | "sprintId">): string {
  return `${item.projectKey}\u0000${item.workItemTypeKey}\u0000${item.workItemId}\u0000${item.sprintId ?? ""}`;
}

type ExistingMeegleLifecycle = {
  current_node_start_time: string | null;
  item_start_time: string | null;
  item_finish_time: string | null;
} | undefined;

function projectMeegleIncrementalLifecycle(
  existing: ExistingMeegleLifecycle,
  lifecycle: MeegleWorkitemLifecycleFields | undefined,
): { itemStartTime: string | null; itemFinishTime: string | null } {
  if (!lifecycle) {
    return {
      itemStartTime: existing?.item_start_time ?? null,
      itemFinishTime: existing?.item_finish_time ?? null,
    };
  }

  if (!lifecycle.phase) {
    return {
      itemStartTime: lifecycle.itemStartTime === undefined
        ? existing?.item_start_time ?? null
        : lifecycle.itemStartTime,
      itemFinishTime: lifecycle.itemFinishTime === undefined
        ? existing?.item_finish_time ?? null
        : lifecycle.itemFinishTime,
    };
  }

  if (lifecycle.phase === "new") {
    return { itemStartTime: null, itemFinishTime: null };
  }

  const itemStartTime = earliestLifecycleTimestamp(existing?.item_start_time, lifecycle.itemStartTime);
  if (lifecycle.phase === "started") {
    return { itemStartTime, itemFinishTime: null };
  }

  return {
    itemStartTime,
    itemFinishTime: lifecycle.itemFinishTime ?? existing?.item_finish_time ?? null,
  };
}

function earliestLifecycleTimestamp(
  existing: string | null | undefined,
  observed: string | null | undefined,
): string | null {
  const candidates = [existing, observed].filter((value): value is string => Boolean(value));
  return candidates.length ? candidates.sort()[0] : null;
}

function projectMeegleSprintMembership(
  existing: ExistingMeegleSprintMembership,
  relation: MeegleSprintRelationFields | undefined,
  historicalAddToCycleTime: string | undefined,
  observedAt: string,
  newMembershipObservedAt?: string,
): { sprintId: string | null; sprintName: string | null; addToCycleTime: string | null } {
  if (!relation?.present) {
    return {
      sprintId: existing?.sprint_id ?? null,
      sprintName: existing?.sprint ?? null,
      addToCycleTime: existing?.add_to_cycle_time ?? null,
    };
  }
  if (!relation.sprintId) {
    return { sprintId: null, sprintName: null, addToCycleTime: null };
  }

  const sameSprint = existing?.sprint_id === relation.sprintId;
  if (sameSprint) {
    return {
      sprintId: relation.sprintId,
      sprintName: relation.sprintName ?? existing?.sprint ?? null,
      addToCycleTime: existing?.add_to_cycle_time ?? historicalAddToCycleTime ?? observedAt,
    };
  }

  const legacyBackfill = Boolean(
    existing
    && !existing.sprint_id
    && existing.sprint
    && relation.sprintName
    && existing.sprint === relation.sprintName,
  );
  return {
    sprintId: relation.sprintId,
    sprintName: relation.sprintName ?? null,
    addToCycleTime: !existing || legacyBackfill
      ? newMembershipObservedAt ?? historicalAddToCycleTime ?? observedAt
      : observedAt,
  };
}

type MeegleWorkitemSyncRow = {
  project_key: string;
  project_name: string | null;
  work_item_type_key: string;
  work_item_id: string;
  work_item_key: string | null;
  title: string;
  work_item_type: string | null;
  status_key: string | null;
  status: string | null;
  sub_stage_key: string | null;
  sub_stage: string | null;
  sprint_id: string | null;
  sprint: string | null;
  version: string | null;
  system: string | null;
  bugs_json: string | null;
  assignee: string | null;
  priority: string | null;
  add_to_cycle_time: string | null;
  current_node_start_time: string | null;
  item_start_time: string | null;
  item_finish_time: string | null;
  created_at: string | null;
  source_updated_at: string | null;
  synced_at: string;
  payload_json?: string;
};

type GitHubPullRequestSyncRow = {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  description?: string | null;
  state: string;
  merged_at: string | null;
  html_url: string;
  author_login: string | null;
  merged_by_login: string | null;
  head_ref: string | null;
  base_ref: string | null;
  is_draft: boolean;
  meegle_ids: string | null;
  source_updated_at: string | null;
  synced_at: string;
  payload_json?: string;
  reviewers_json: string | null;
  labels_json: string | null;
  created_at: string | null;
};

type LarkBaseTicketSyncRow = {
  base_id: string;
  table_id: string;
  record_id: string;
  title: string;
  ticket_status: string | null;
  octo_shared_url: string | null;
  octo_ticket_ai?: string | null;
  created_time: string | null;
  source_updated_at: string | null;
  synced_at: string;
  fields_json?: string;
  ticket_number: string | null;
  issue_type: string | null;
  requester: string | null;
  responsible: string | null;
  priority: string | null;
  detail_description: string | null;
  meegle_link: string | null;
  lark_message_link: string | null;
};

function toMeegleWorkitemSyncItem(row: MeegleWorkitemSyncRow): MeegleWorkitemSyncItem {
  return {
    projectKey: row.project_key,
    projectName: row.project_name ?? undefined,
    workItemTypeKey: row.work_item_type_key,
    workItemId: row.work_item_id,
    workItemKey: row.work_item_key ?? undefined,
    title: row.title,
    workItemType: row.work_item_type ?? undefined,
    statusKey: row.status_key ?? undefined,
    status: row.status ?? undefined,
    subStageKey: row.sub_stage_key ?? undefined,
    subStage: row.sub_stage ?? undefined,
    sprintId: row.sprint_id ?? undefined,
    sprint: row.sprint ?? undefined,
    version: row.version ?? undefined,
    system: row.system ?? undefined,
    bugs: parseStringArray(row.bugs_json),
    assignee: row.assignee ?? undefined,
    priority: row.priority ?? undefined,
    addToCycleTime: row.add_to_cycle_time ?? undefined,
    currentNodeStartTime: row.current_node_start_time ?? undefined,
    itemStartTime: row.item_start_time ?? undefined,
    itemFinishTime: row.item_finish_time ?? undefined,
    createdAt: row.created_at ?? undefined,
    sourcePayload: parseMeegleWorkitem(row.payload_json),
    sourceUpdatedAt: row.source_updated_at ?? undefined,
    syncedAt: row.synced_at,
  };
}

function parseMeegleWorkitem(value: string | undefined): MeegleWorkitem | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as MeegleWorkitem : undefined;
  } catch {
    return undefined;
  }
}

function toGitHubPullRequestSyncItem(row: GitHubPullRequestSyncRow): GitHubPullRequestSyncItem {
  return {
    owner: row.owner,
    repo: row.repo,
    pullNumber: row.pull_number,
    title: row.title,
    description: row.description ?? undefined,
    state: row.merged_at ? "merged" : row.state,
    htmlUrl: row.html_url,
    authorLogin: row.author_login ?? undefined,
    mergedBy: row.merged_by_login ?? undefined,
    headRef: row.head_ref ?? undefined,
    baseRef: row.base_ref ?? undefined,
    isDraft: row.is_draft,
    meegleIds: parseStringArray(row.meegle_ids) ?? [],
    sourcePayload: parseGitHubPullRequest(row.payload_json),
    reviewers: parseStringArray(row.reviewers_json),
    labels: parseStringArray(row.labels_json),
    createdAt: row.created_at ?? undefined,
    sourceUpdatedAt: row.source_updated_at ?? undefined,
    syncedAt: row.synced_at,
  };
}

function parseGitHubPullRequest(value: string | undefined): GitHubPrDetails | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as GitHubPrDetails : undefined;
  } catch {
    return undefined;
  }
}

function toLarkBaseTicketSyncItem(row: LarkBaseTicketSyncRow): LarkBaseTicketSyncItem {
  return {
    baseId: row.base_id,
    tableId: row.table_id,
    recordId: row.record_id,
    title: row.title,
    ticketStatus: row.ticket_status ?? undefined,
    sharedUrl: row.octo_shared_url ?? undefined,
    createdTime: row.created_time ?? undefined,
    sourceFields: parseRecord(row.fields_json),
    ticketNumber: row.ticket_number ?? undefined,
    issueType: row.issue_type ?? undefined,
    requester: row.requester ?? undefined,
    responsible: row.responsible ?? undefined,
    priority: row.priority ?? undefined,
    detailDescription: row.detail_description ?? undefined,
    meegleLink: row.meegle_link ?? undefined,
    larkMessageLink: row.lark_message_link ?? undefined,
    ticketAi: parseLarkTicketAiData(row.octo_ticket_ai),
    sourceUpdatedAt: row.source_updated_at ?? undefined,
    syncedAt: row.synced_at,
  };
}

function parseRecord(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function parseStringArray(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function uniqueLarkRefs(refs: LarkBaseTicketSyncRef[]): LarkBaseTicketSyncRef[] {
  const unique = new Map<string, LarkBaseTicketSyncRef>();
  for (const ref of refs) {
    unique.set(`${ref.baseId}\u0000${ref.tableId}\u0000${ref.recordId}`, ref);
  }
  return [...unique.values()];
}

export function extractMeegleIds(title: string, description: string | null): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const pattern = /\b[mf]-(\d+)\b/gi;

  for (const text of [title, description ?? ""]) {
    for (const match of text.matchAll(pattern)) {
      const id = match[1];
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }

  return ids;
}
