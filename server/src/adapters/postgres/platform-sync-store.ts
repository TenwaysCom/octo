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
