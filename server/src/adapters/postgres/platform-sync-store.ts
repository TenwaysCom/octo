import type { Kysely } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";
import type { MeegleSyncMapping, MeegleWorkitem } from "../meegle/meegle-client.js";
import type { GitHubPrDetails } from "../github/github-types.js";
import type { LarkBitableRecord } from "../lark/lark-client.js";

export interface PlatformSyncStore {
  upsertMeegleWorkitem(input: {
    projectKey: string;
    workItemTypeKey: string;
    workitem: MeegleWorkitem;
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
  listMeegleWorkitems(limit: number, sprint?: string): Promise<MeegleWorkitemSyncItem[]>;
  listMeegleSprints(): Promise<string[]>;
  listGitHubPullRequests(limit: number): Promise<GitHubPullRequestSyncItem[]>;
  listLarkBaseTickets(limit: number): Promise<LarkBaseTicketSyncItem[]>;
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
  sourceUpdatedAt?: string;
  syncedAt: string;
}

export interface GitHubPullRequestSyncItem {
  owner: string;
  repo: string;
  pullNumber: number;
  title: string;
  state: string;
  htmlUrl: string;
  authorLogin?: string;
  headRef?: string;
  baseRef?: string;
  isDraft: boolean;
  meegleIds: string[];
  sourceUpdatedAt?: string;
  syncedAt: string;
}

export interface LarkBaseTicketSyncItem {
  baseId: string;
  tableId: string;
  recordId: string;
  title: string;
  ticketStatus?: string;
  sharedUrl?: string;
  createdTime?: string;
  sourceUpdatedAt?: string;
  syncedAt: string;
}

export class PostgresPlatformSyncStore implements PlatformSyncStore {
  constructor(private readonly db: Kysely<DatabaseSchema> = getSharedDatabase()) {}

  async upsertMeegleWorkitem(input: {
    projectKey: string;
    workItemTypeKey: string;
    workitem: MeegleWorkitem;
  }): Promise<void> {
    const now = new Date().toISOString();
    const sourceUpdatedAt = findSourceUpdatedAt(input.workitem.fields);
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
      payload_json: JSON.stringify(input.workitem),
      source_updated_at: sourceUpdatedAt,
      synced_at: now,
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
      payload_json: JSON.stringify(input.workitem),
      source_updated_at: sourceUpdatedAt,
      synced_at: now,
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
      })).execute();
  }

  async upsertLarkBaseTicket(input: {
    baseId: string;
    tableId: string;
    record: LarkBitableRecord;
    title: string;
    status?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insertInto("lark_base_ticket_syncs").values({
      base_id: input.baseId,
      table_id: input.tableId,
      record_id: input.record.record_id,
      title: input.title,
      ticket_status: input.status ?? null,
      fields_json: JSON.stringify(input.record.fields),
      shared_url: input.record.shared_url ?? null,
      created_time: input.record.created_time ?? null,
      source_updated_at: input.record.updated_time ?? null,
      synced_at: now,
    }).onConflict((conflict) => conflict.columns(["base_id", "table_id", "record_id"])
      .doUpdateSet({
        title: input.title,
        ticket_status: input.status ?? null,
        fields_json: JSON.stringify(input.record.fields),
        shared_url: input.record.shared_url ?? null,
        created_time: input.record.created_time ?? null,
        source_updated_at: input.record.updated_time ?? null,
        synced_at: now,
      })).execute();
  }

  async listMeegleWorkitems(limit: number, sprint?: string): Promise<MeegleWorkitemSyncItem[]> {
    let query = this.db.selectFrom("meegle_workitem_syncs")
      .select([
        "project_key", "project_name", "work_item_type_key", "work_item_id", "work_item_key", "title",
        "work_item_type", "status_key", "status", "sub_stage_key", "sub_stage",
        "sprint", "version", "system", "bugs_json",
        "assignee", "source_updated_at", "synced_at",
      ]);
    if (sprint) {
      query = query.where("sprint", "=", sprint);
    }
    const rows = await query.orderBy("source_updated_at", "desc")
      .orderBy("synced_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({
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
      sourceUpdatedAt: row.source_updated_at ?? undefined,
      syncedAt: row.synced_at,
    }));
  }

  async listMeegleSprints(): Promise<string[]> {
    const rows = await this.db.selectFrom("meegle_workitem_syncs")
      .select("sprint")
      .where("sprint", "is not", null)
      .distinct()
      .orderBy("sprint")
      .execute();
    return rows.map((row) => row.sprint).filter((sprint): sprint is string => sprint !== null);
  }

  async listGitHubPullRequests(limit: number): Promise<GitHubPullRequestSyncItem[]> {
    const rows = await this.db.selectFrom("github_pr_syncs")
      .select([
        "owner", "repo", "pull_number", "title", "state", "html_url", "author_login",
        "head_ref", "base_ref", "is_draft", "meegle_ids", "source_updated_at", "synced_at",
      ])
      .orderBy("source_updated_at", "desc")
      .orderBy("synced_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      owner: row.owner,
      repo: row.repo,
      pullNumber: row.pull_number,
      title: row.title,
      state: row.state,
      htmlUrl: row.html_url,
      authorLogin: row.author_login ?? undefined,
      headRef: row.head_ref ?? undefined,
      baseRef: row.base_ref ?? undefined,
      isDraft: row.is_draft,
      meegleIds: parseStringArray(row.meegle_ids) ?? [],
      sourceUpdatedAt: row.source_updated_at ?? undefined,
      syncedAt: row.synced_at,
    }));
  }

  async listLarkBaseTickets(limit: number): Promise<LarkBaseTicketSyncItem[]> {
    const rows = await this.db.selectFrom("lark_base_ticket_syncs")
      .select([
        "base_id", "table_id", "record_id", "title", "ticket_status", "shared_url",
        "created_time", "source_updated_at", "synced_at",
      ])
      .orderBy("source_updated_at", "desc")
      .orderBy("synced_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      baseId: row.base_id,
      tableId: row.table_id,
      recordId: row.record_id,
      title: row.title,
      ticketStatus: row.ticket_status ?? undefined,
      sharedUrl: row.shared_url ?? undefined,
      createdTime: row.created_time ?? undefined,
      sourceUpdatedAt: row.source_updated_at ?? undefined,
      syncedAt: row.synced_at,
    }));
  }
}

function findSourceUpdatedAt(fields: Record<string, unknown>): string | null {
  for (const key of ["updated_at", "updatedAt", "update_time", "updateTime"]) {
    const value = fields[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }
  }
  return null;
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

export function extractMeegleIds(title: string, description: string | null): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const pattern = /\b([mf]-\d+)\b/gi;

  for (const text of [title, description ?? ""]) {
    for (const match of text.matchAll(pattern)) {
      const id = match[1].toLowerCase();
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }

  return ids;
}
