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
import { MEEGLE_SPRINT_API_NAME, MEEGLE_SPRINT_WORKITEM_TYPE_KEY } from "../../domain/meegle-workitem-types.js";

const MEEGLE_SPRINT_TYPE_KEYS = [MEEGLE_SPRINT_API_NAME, MEEGLE_SPRINT_WORKITEM_TYPE_KEY];

export interface PlatformSyncStore {
  upsertMeegleWorkitem(input: {
    projectKey: string;
    workItemTypeKey: string;
    workitem: MeegleWorkitem;
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
  sprint?: string;
  version?: string;
  system?: string;
  bugs?: string[];
  assignee?: string;
  priority?: string;
  itemCycleTag?: string;
  addToCycleTime?: string;
  itemStartTime?: string;
  itemFinishTime?: string;
  sourcePayload?: MeegleWorkitem;
  sourceUpdatedAt?: string;
  syncedAt: string;
}

export interface MeegleWorkitemLifecycleFields {
  itemCycleTag?: string;
  addToCycleTime?: string;
  itemStartTime?: string;
  itemFinishTime?: string;
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
  sprint?: string;
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
    lifecycle?: MeegleWorkitemLifecycleFields;
  }): Promise<void> {
    const now = new Date().toISOString();
    const sourceUpdatedAt = input.workitem.updatedAt ?? null;
    await this.db.insertInto("meegle_workitem_syncs").values({
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
      item_cycle_tag: input.lifecycle?.itemCycleTag ?? null,
      add_to_cycle_time: input.lifecycle?.addToCycleTime ?? null,
      item_start_time: input.lifecycle?.itemStartTime ?? null,
      item_finish_time: input.lifecycle?.itemFinishTime ?? null,
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
      item_cycle_tag: input.lifecycle?.itemCycleTag ?? null,
      add_to_cycle_time: input.lifecycle?.addToCycleTime ?? null,
      item_start_time: input.lifecycle?.itemStartTime ?? null,
      item_finish_time: input.lifecycle?.itemFinishTime ?? null,
      payload_json: JSON.stringify(input.workitem),
      source_updated_at: sourceUpdatedAt,
      synced_at: now,
      last_seen_at: now,
      stale: false,
    })).execute();
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
          "work_item_type", "status_key", "status", "sub_stage_key", "sub_stage", "sprint", "version",
          "system", "bugs_json", "assignee", "priority", "source_updated_at", "synced_at", "payload_json",
          "item_cycle_tag", "add_to_cycle_time", "item_start_time", "item_finish_time",
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
      .select(["sprint", "version", "system", "bugs_json"])
      .where("project_key", "=", input.projectKey)
      .where("work_item_type_key", "=", input.workItemTypeKey)
      .where("work_item_id", "=", input.workItemId)
      .executeTakeFirst();
    const bugsJson = JSON.stringify(input.bugs);
    if (existing && existing.sprint === input.sprint && existing.version === input.version
      && existing.system === input.system && existing.bugs_json === bugsJson) return false;
    await this.db.updateTable("meegle_workitem_syncs").set({
      sprint: input.sprint ?? null,
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
        "sprint", "version", "system", "bugs_json",
        "assignee", "priority", "source_updated_at", "synced_at",
        "item_cycle_tag", "add_to_cycle_time", "item_start_time", "item_finish_time",
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
        "sprint", "version", "system", "bugs_json", "assignee", "priority",
        "source_updated_at", "synced_at", "payload_json",
        "item_cycle_tag", "add_to_cycle_time", "item_start_time", "item_finish_time",
      ])
      .where("work_item_type_key", "in", MEEGLE_SPRINT_TYPE_KEYS)
      .orderBy("source_updated_at", "desc")
      .orderBy("synced_at", "desc")
      .execute();
    return rows.map(toMeegleWorkitemSyncItem);
  }

  async listMeegleWorkitemsByIds(workItemIds: string[]): Promise<MeegleWorkitemSyncItem[]> {
    const results: MeegleWorkitemSyncItem[] = [];
    for (const batch of chunks([...new Set(workItemIds)], 500)) {
      if (batch.length === 0) continue;
      const rows = await this.db.selectFrom("meegle_workitem_syncs")
        .select([
          "project_key", "project_name", "work_item_type_key", "work_item_id", "work_item_key", "title",
          "work_item_type", "status_key", "status", "sub_stage_key", "sub_stage",
          "sprint", "version", "system", "bugs_json", "assignee", "priority", "source_updated_at", "synced_at",
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
        "owner", "repo", "pull_number", "title", "state", "merged_at", "html_url", "head_ref", "base_ref", "meegle_ids",
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
  sprint: string | null;
  version: string | null;
  system: string | null;
  bugs_json: string | null;
  assignee: string | null;
  priority: string | null;
  item_cycle_tag: string | null;
  add_to_cycle_time: string | null;
  item_start_time: string | null;
  item_finish_time: string | null;
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
    sprint: row.sprint ?? undefined,
    version: row.version ?? undefined,
    system: row.system ?? undefined,
    bugs: parseStringArray(row.bugs_json),
    assignee: row.assignee ?? undefined,
    priority: row.priority ?? undefined,
    itemCycleTag: row.item_cycle_tag ?? undefined,
    addToCycleTime: row.add_to_cycle_time ?? undefined,
    itemStartTime: row.item_start_time ?? undefined,
    itemFinishTime: row.item_finish_time ?? undefined,
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
