import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { preparePostgresConnection, type PreparedPostgresConnection } from "./ssh-tunnel.js";
import type { DatabaseSchema } from "./schema.js";
import {
  DEFAULT_LARK_BUG_ANALYZE_PROMPT_NOTE,
  DEFAULT_LARK_BUG_ANALYZE_PROMPT_TEMPLATE,
  DEFAULT_LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_NOTE,
  DEFAULT_LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_NOTE,
  DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_NOTE,
  DEFAULT_LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_TEMPLATE,
  DEFAULT_LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_TEMPLATE,
  DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATE,
  LEGACY_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATES,
  DEFAULT_MEEGLE_SPRINT_CONFIRM_GAPS_PROMPT_NOTE,
  DEFAULT_MEEGLE_SPRINT_CONFIRM_GAPS_PROMPT_TEMPLATE,
  DEFAULT_MEEGLE_SPRINT_INTERNAL_SUMMARY_PROMPT_NOTE,
  DEFAULT_MEEGLE_SPRINT_INTERNAL_SUMMARY_PROMPT_TEMPLATE,
  DEFAULT_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_NOTE,
  DEFAULT_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_TEMPLATE,
  DEFAULT_GITHUB_PR_DEEP_REVIEW_PROMPT_NOTE,
  DEFAULT_GITHUB_PR_DEEP_REVIEW_PROMPT_TEMPLATE,
  DEFAULT_GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_NOTE,
  DEFAULT_GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_TEMPLATE,
  DEFAULT_GITHUB_PR_QUICK_SCAN_PROMPT_NOTE,
  DEFAULT_GITHUB_PR_QUICK_SCAN_PROMPT_TEMPLATE,
  GITHUB_PR_DEEP_REVIEW_PROMPT_KEY,
  GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_KEY,
  GITHUB_PR_QUICK_SCAN_PROMPT_KEY,
  DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_NOTE,
  DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_TEMPLATE,
  LARK_BUG_ANALYZE_PROMPT_KEY,
  LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_KEY,
  LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_KEY,
  LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY,
  MEEGLE_SPRINT_CONFIRM_GAPS_PROMPT_KEY,
  MEEGLE_SPRINT_INTERNAL_SUMMARY_PROMPT_KEY,
  MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_KEY,
  STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY,
} from "../../domain/workflow-prompts.js";

function readPostgresUri(): string {
  return process.env.POSTGRES_URI || process.env.DATABASE_URL || "";
}

const LEGACY_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_TEMPLATE = `你正在为公司内部同事生成 Sprint Release Notes。必须先阅读并严格遵循以下 Skill：
{{skill_path}}

当前 Sprint 上下文：
{{sprint_context}}

用户请求：
{{user_message}}

只使用 Sprint 上下文中明确提供的信息。不要调用外部系统、不要写入任何系统、不要编造功能、影响范围、根因、上线状态或指标。输出简明中文 Markdown；省略没有可靠内容的章节。`;

export function getDefaultPostgresUri(): string {
  return readPostgresUri();
}

function resolvePostgresUri(): string {
  const postgresUri = readPostgresUri();
  if (!postgresUri) {
    throw new Error("POSTGRES_URI is not configured");
  }

  return postgresUri;
}

export function createPostgresDatabase(
  connectionString: string = resolvePostgresUri(),
): Kysely<DatabaseSchema> {
  const pool = new Pool({
    connectionString,
  });

  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool,
    }),
  });
}

export async function ensurePostgresSchema(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema
    .createTable("workflow_prompts")
    .ifNotExists()
    .addColumn("key", "text", (column) => column.primaryKey())
    .addColumn("prompt", "text", (column) => column.notNull())
    .addColumn("note", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("acp_kimi_session_owners")
    .ifNotExists()
    .addColumn("session_id", "text", (column) => column.primaryKey())
    .addColumn("operator_lark_id", "text", (column) => column.notNull())
    .addColumn("title", "text")
    .addColumn("ticket_base_id", "text")
    .addColumn("ticket_table_id", "text")
    .addColumn("ticket_record_id", "text")
    .addColumn("ticket_number", "text")
    .addColumn("runtime_host_name", "text")
    .addColumn("kimi_work_dir", "text")
    .addColumn("automation_action_key", "text")
    .addColumn("execution_policy", "text")
    .addColumn("skill_profile", "text")
    .addColumn("skill_id", "text")
    .addColumn("policy_version", "text")
    .addColumn("thread_id", "text")
    .addColumn("thread_snapshot_version", "integer")
    .addColumn("thread_context_synced_at", "text")
    .addColumn("action_run_id", "text")
    .addColumn("run_status", "text")
    .addColumn("run_error_code", "text")
    .addColumn("run_error_message", "text")
    .addColumn("unverified_output", "text")
    .addColumn("deleted_at", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("acp_kimi_sprint_session_refs")
    .ifNotExists()
    .addColumn("session_id", "text", (column) => column.primaryKey())
    .addColumn("operator_lark_id", "text", (column) => column.notNull())
    .addColumn("project_key", "text", (column) => column.notNull())
    .addColumn("sprint_id", "text", (column) => column.notNull())
    .addColumn("context_hash", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("lark_tenant_key", "text")
    .addColumn("lark_id", "text")
    .addColumn("lark_email", "text")
    .addColumn("lark_name", "text")
    .addColumn("lark_avatar_url", "text")
    .addColumn("role", "text")
    .addColumn("meegle_base_url", "text")
    .addColumn("meegle_user_key", "text")
    .addColumn("github_id", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("user_ssh_public_keys")
    .ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("master_user_id", "text", (column) => column.notNull())
    .addColumn("public_key", "text", (column) => column.notNull())
    .addColumn("label", "text")
    .addColumn("public_key_fingerprint", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await renameLegacyUserSshPublicKeyIdColumn(db);
  await sql`
    ALTER TABLE user_ssh_public_keys
    ADD COLUMN IF NOT EXISTS label text
  `.execute(db);

  await db.schema
    .createTable("lark_contacts")
    .ifNotExists()
    .addColumn("open_id", "text", (column) => column.primaryKey())
    .addColumn("email", "text")
    .addColumn("name", "text")
    .addColumn("meegle_user_key", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("user_tokens")
    .ifNotExists()
    .addColumn("master_user_id", "text", (column) => column.notNull())
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("provider_tenant_key", "text", (column) => column.notNull())
    .addColumn("external_user_key", "text", (column) => column.notNull())
    .addColumn("base_url", "text", (column) => column.notNull())
    .addColumn("plugin_token", "text")
    .addColumn("plugin_token_expires_at", "text")
    .addColumn("user_token", "text", (column) => column.notNull())
    .addColumn("user_token_expires_at", "text")
    .addColumn("refresh_token", "text")
    .addColumn("refresh_token_expires_at", "text")
    .addColumn("credential_status", "text", (column) => column.notNull())
    .addColumn("last_auth_at", "text", (column) => column.notNull())
    .addColumn("last_refresh_at", "text")
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("user_tokens_pkey", [
      "master_user_id",
      "provider",
      "provider_tenant_key",
      "external_user_key",
      "base_url",
    ])
    .execute();

  await db.schema
    .createTable("oauth_sessions")
    .ifNotExists()
    .addColumn("state", "text", (column) => column.primaryKey())
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("master_user_id", "text")
    .addColumn("base_url", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("auth_code", "text")
    .addColumn("external_user_key", "text")
    .addColumn("error_code", "text")
    .addColumn("expires_at", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("web_sessions")
    .ifNotExists()
    .addColumn("session_token_hash", "text", (column) => column.primaryKey())
    .addColumn("master_user_id", "text", (column) => column.notNull())
    .addColumn("base_url", "text", (column) => column.notNull())
    .addColumn("expires_at", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addColumn("invalidated_at", "text")
    .execute();

  await db.schema
    .createTable("web_plugin_login_challenges")
    .ifNotExists()
    .addColumn("challenge_id_hash", "text", (column) => column.primaryKey())
    .addColumn("browser_proof_hash", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("master_user_id", "text")
    .addColumn("base_url", "text")
    .addColumn("expires_at", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addColumn("consumed_at", "text")
    .execute();

  await db.schema
    .createTable("github_pr_review_runs")
    .ifNotExists()
    .addColumn("action_run_id", "text", (column) => column.primaryKey())
    .addColumn("master_user_id", "text", (column) => column.notNull())
    .addColumn("operation", "text", (column) => column.notNull())
    .addColumn("pr_url", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("comment_url", "text")
    .addColumn("reviewed_files_json", "text")
    .addColumn("feedback_count", "integer")
    .addColumn("feedback_record_ids_json", "text")
    .addColumn("diff_truncated", "boolean")
    .addColumn("error_code", "text")
    .addColumn("error_message", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("started_at", "text")
    .addColumn("completed_at", "text")
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("meegle_workitem_syncs")
    .ifNotExists()
    .addColumn("project_key", "text", (column) => column.notNull())
    .addColumn("project_name", "text")
    .addColumn("work_item_type_key", "text", (column) => column.notNull())
    .addColumn("work_item_id", "text", (column) => column.notNull())
    .addColumn("work_item_key", "text")
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("work_item_type", "text")
    .addColumn("status_key", "text")
    .addColumn("status", "text")
    .addColumn("sub_stage_key", "text")
    .addColumn("sub_stage", "text")
    .addColumn("sprint_id", "text")
    .addColumn("sprint", "text")
    .addColumn("version", "text")
    .addColumn("system", "text")
    .addColumn("bugs_json", "text")
    .addColumn("assignee", "text")
    .addColumn("priority", "text")
    .addColumn("add_to_cycle_time", "text")
    .addColumn("current_node_start_time", "text")
    .addColumn("item_start_time", "text")
    .addColumn("item_finish_time", "text")
    .addColumn("created_at", "text")
    .addColumn("payload_json", "text", (column) => column.notNull())
    .addColumn("source_updated_at", "text")
    .addColumn("synced_at", "text", (column) => column.notNull())
    .addColumn("last_seen_at", "text")
    .addColumn("stale", "boolean", (column) => column.notNull().defaultTo(false))
    .addPrimaryKeyConstraint("meegle_workitem_syncs_pkey", ["project_key", "work_item_type_key", "work_item_id"])
    .execute();

  await db.schema
    .createTable("meegle_workitem_role_members")
    .ifNotExists()
    .addColumn("project_key", "text", (column) => column.notNull())
    .addColumn("work_item_type_key", "text", (column) => column.notNull())
    .addColumn("work_item_id", "text", (column) => column.notNull())
    .addColumn("role_key", "text", (column) => column.notNull())
    .addColumn("role_name", "text", (column) => column.notNull())
    .addColumn("member_key", "text", (column) => column.notNull())
    .addColumn("member_name", "text", (column) => column.notNull())
    .addColumn("role_order", "integer", (column) => column.notNull())
    .addColumn("member_order", "integer", (column) => column.notNull())
    .addColumn("synced_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("meegle_workitem_role_members_pkey", [
      "project_key", "work_item_type_key", "work_item_id", "role_key", "member_key",
    ])
    .addForeignKeyConstraint(
      "meegle_workitem_role_members_workitem_fkey",
      ["project_key", "work_item_type_key", "work_item_id"],
      "meegle_workitem_syncs",
      ["project_key", "work_item_type_key", "work_item_id"],
      (constraint) => constraint.onDelete("cascade"),
    )
    .addCheckConstraint("meegle_workitem_role_members_role_order_check", sql`role_order >= 0`)
    .addCheckConstraint("meegle_workitem_role_members_member_order_check", sql`member_order >= 0`)
    .execute();
  await sql`
    CREATE INDEX IF NOT EXISTS meegle_workitem_role_members_member_idx
    ON meegle_workitem_role_members (member_key, project_key, work_item_type_key, work_item_id)
  `.execute(db);

  await db.schema
    .createTable("meegle_workitem_sprint_memberships")
    .ifNotExists()
    .addColumn("project_key", "text", (column) => column.notNull())
    .addColumn("work_item_type_key", "text", (column) => column.notNull())
    .addColumn("work_item_id", "text", (column) => column.notNull())
    .addColumn("sprint_id", "text", (column) => column.notNull())
    .addColumn("added_at", "text", (column) => column.notNull())
    .addColumn("started_at", "text")
    .addColumn("finished_at", "text")
    .addColumn("removed_at", "text")
    .addColumn("source", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("meegle_workitem_sprint_memberships_pkey", [
      "project_key", "work_item_type_key", "work_item_id", "sprint_id", "added_at",
    ])
    .execute();
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS meegle_workitem_sprint_memberships_open_unique
    ON meegle_workitem_sprint_memberships (project_key, work_item_type_key, work_item_id)
    WHERE removed_at IS NULL
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS meegle_workitem_sprint_memberships_sprint_timeline
    ON meegle_workitem_sprint_memberships (project_key, sprint_id, added_at)
  `.execute(db);

  await db.schema
    .createTable("meegle_sync_mappings")
    .ifNotExists()
    .addColumn("project_key", "text", (column) => column.notNull())
    .addColumn("work_item_type_key", "text", (column) => column.notNull())
    .addColumn("mapping_kind", "text", (column) => column.notNull())
    .addColumn("source_key", "text", (column) => column.notNull())
    .addColumn("display_value", "text", (column) => column.notNull())
    .addColumn("synced_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("meegle_sync_mappings_pkey", ["project_key", "work_item_type_key", "mapping_kind", "source_key"])
    .execute();

  await db.schema
    .createTable("github_pr_syncs")
    .ifNotExists()
    .addColumn("owner", "text", (column) => column.notNull())
    .addColumn("repo", "text", (column) => column.notNull())
    .addColumn("pull_number", "integer", (column) => column.notNull())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("description", "text")
    .addColumn("state", "text", (column) => column.notNull())
    .addColumn("merged_at", "text")
    .addColumn("html_url", "text", (column) => column.notNull())
    .addColumn("author_login", "text")
    .addColumn("merged_by_login", "text")
    .addColumn("head_ref", "text")
    .addColumn("base_ref", "text")
    .addColumn("is_draft", "boolean", (column) => column.notNull())
    .addColumn("meegle_ids", "text", (column) => column.notNull().defaultTo("[]"))
    .addColumn("reviewers_json", "text")
    .addColumn("labels_json", "text")
    .addColumn("created_at", "text")
    .addColumn("payload_json", "text", (column) => column.notNull())
    .addColumn("source_updated_at", "text")
    .addColumn("synced_at", "text", (column) => column.notNull())
    .addColumn("last_seen_at", "text")
    .addColumn("stale", "boolean", (column) => column.notNull().defaultTo(false))
    .addPrimaryKeyConstraint("github_pr_syncs_pkey", ["owner", "repo", "pull_number"])
    .execute();

  await db.schema
    .createTable("lark_base_ticket_syncs")
    .ifNotExists()
    .addColumn("base_id", "text", (column) => column.notNull())
    .addColumn("table_id", "text", (column) => column.notNull())
    .addColumn("record_id", "text", (column) => column.notNull())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("ticket_status", "text")
    .addColumn("fields_json", "text", (column) => column.notNull())
    .addColumn("shared_url", "text")
    .addColumn("created_time", "text")
    .addColumn("source_updated_at", "text")
    .addColumn("synced_at", "text", (column) => column.notNull())
    .addColumn("last_seen_at", "text")
    .addColumn("stale", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("ticket_number", "text")
    .addColumn("issue_type", "text")
    .addColumn("requester", "text")
    .addColumn("responsible", "text")
    .addColumn("priority", "text")
    .addColumn("detail_description", "text")
    .addColumn("meegle_link", "text")
    .addColumn("lark_message_link", "text")
    .addPrimaryKeyConstraint("lark_base_ticket_syncs_pkey", ["base_id", "table_id", "record_id"])
    .execute();

  await db.schema
    .createTable("lark_ticket_thread_syncs")
    .ifNotExists()
    .addColumn("base_id", "text", (column) => column.notNull())
    .addColumn("table_id", "text", (column) => column.notNull())
    .addColumn("record_id", "text", (column) => column.notNull())
    .addColumn("message_link", "text", (column) => column.notNull())
    .addColumn("thread_id", "text", (column) => column.notNull())
    .addColumn("messages_json", "text", (column) => column.notNull().defaultTo('{"schemaVersion":1,"messages":[]}'))
    .addColumn("prepared_messages_json", "text")
    .addColumn("snapshot_version", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("history_complete", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("watermark_created_at", "text")
    .addColumn("watermark_message_id", "text")
    .addColumn("last_checked_at", "text")
    .addColumn("last_successful_sync_at", "text")
    .addColumn("last_full_reconciled_at", "text")
    .addColumn("dirty", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("frozen_at", "text")
    .addColumn("frozen_status", "text")
    .addColumn("last_error", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("lark_ticket_thread_syncs_pkey", ["base_id", "table_id", "record_id"])
    .execute();

  await sql`
    ALTER TABLE lark_ticket_thread_syncs
    ADD COLUMN IF NOT EXISTS prepared_messages_json text
  `.execute(db);

  await db.schema.createTable("support_analysis_runs").ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("action_run_id", "text", (column) => column.notNull().defaultTo("legacy"))
    .addColumn("source_name", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("taxonomy_version", "text", (column) => column.notNull())
    .addColumn("rubric_version", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();
  await sql`
    ALTER TABLE support_analysis_runs
    ADD COLUMN IF NOT EXISTS action_run_id text NOT NULL DEFAULT 'legacy'
  `.execute(db);
  await db.schema.createTable("support_thread_intent_segments").ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("analysis_run_id", "text", (column) => column.notNull())
    .addColumn("base_id", "text", (column) => column.notNull())
    .addColumn("table_id", "text", (column) => column.notNull())
    .addColumn("record_id", "text", (column) => column.notNull())
    .addColumn("snapshot_version", "integer", (column) => column.notNull())
    .addColumn("segment_key", "text", (column) => column.notNull())
    .addColumn("redacted_summary", "text")
    .addColumn("intent_json", "text", (column) => column.notNull())
    .addColumn("evidence_message_ids_json", "text", (column) => column.notNull())
    .addColumn("review_status", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addUniqueConstraint("support_thread_intent_segments_version_key", ["base_id", "table_id", "record_id", "snapshot_version", "segment_key"])
    .execute();
  await db.schema.createTable("support_thread_results").ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("intent_segment_id", "text", (column) => column.notNull())
    .addColumn("result_json", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();
  await db.schema.createTable("support_quality_reviews").ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("intent_segment_id", "text", (column) => column.notNull())
    .addColumn("reviewer_kind", "text", (column) => column.notNull())
    .addColumn("score_json", "text", (column) => column.notNull())
    .addColumn("critical_issues_json", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();
  await db.schema.createTable("lark_ticket_eval_samples").ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("base_id", "text", (column) => column.notNull())
    .addColumn("table_id", "text", (column) => column.notNull())
    .addColumn("record_id", "text", (column) => column.notNull())
    .addColumn("ticket_title", "text", (column) => column.notNull())
    .addColumn("snapshot_version", "integer", (column) => column.notNull())
    .addColumn("ai_output_json", "text", (column) => column.notNull())
    .addColumn("dataset_status", "text", (column) => column.notNull())
    .addColumn("manual_intent", "text")
    .addColumn("expected_outcome", "text")
    .addColumn("notes", "text")
    .addColumn("failure_labels_json", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addUniqueConstraint("lark_ticket_eval_samples_ticket_snapshot", ["base_id", "table_id", "record_id", "snapshot_version"])
    .execute();
  await db.schema.createTable("support_ticket_reply_drafts").ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("base_id", "text", (column) => column.notNull())
    .addColumn("table_id", "text", (column) => column.notNull())
    .addColumn("record_id", "text", (column) => column.notNull())
    .addColumn("session_id", "text", (column) => column.notNull())
    .addColumn("operator_lark_id", "text", (column) => column.notNull())
    .addColumn("draft_hash", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("sent_message_id", "text")
    .addColumn("action_run_id", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addUniqueConstraint("support_ticket_reply_drafts_idempotency", ["base_id", "table_id", "record_id", "session_id", "draft_hash"])
    .execute();
  await db.schema.createTable("support_knowledge_documents").ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("source_kind", "text", (column) => column.notNull())
    .addColumn("source_ref", "text", (column) => column.notNull())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("redacted_summary", "text")
    .addColumn("tags_json", "text", (column) => column.notNull().defaultTo("[]"))
    .addColumn("approval_status", "text", (column) => column.notNull())
    .addColumn("approved_by", "text", (column) => column.notNull())
    .addColumn("approved_at", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addUniqueConstraint("support_knowledge_documents_source_key", ["source_kind", "source_ref"])
    .execute();
  await db.schema.createTable("support_knowledge_chunks").ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("document_id", "text", (column) => column.notNull())
    .addColumn("sequence", "integer", (column) => column.notNull())
    .addColumn("redacted_content", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addUniqueConstraint("support_knowledge_chunks_document_sequence", ["document_id", "sequence"])
    .execute();

  await db.schema
    .createTable("platform_sync_checkpoints")
    .ifNotExists()
    .addColumn("platform", "text", (column) => column.notNull())
    .addColumn("scope_key", "text", (column) => column.notNull())
    .addColumn("watermark_updated_at", "text")
    .addColumn("watermark_tiebreaker", "text")
    .addColumn("last_success_at", "text")
    .addColumn("last_error", "text")
    .addColumn("version", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("platform_sync_checkpoints_pkey", ["platform", "scope_key"])
    .execute();

  await sql`
    ALTER TABLE platform_sync_checkpoints
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0
  `.execute(db);

  await db.schema
    .createTable("platform_sync_runs")
    .ifNotExists()
    .addColumn("run_id", "text", (column) => column.notNull().primaryKey())
    .addColumn("platform", "text", (column) => column.notNull())
    .addColumn("scope_key", "text", (column) => column.notNull())
    .addColumn("mode", "text", (column) => column.notNull())
    .addColumn("clean_after_sync", "boolean", (column) => column.notNull())
    .addColumn("started_at", "text", (column) => column.notNull())
    .addColumn("completed_at", "text")
    .addColumn("listed", "integer")
    .addColumn("skipped_inactive", "integer")
    .addColumn("synced", "integer")
    .addColumn("cleaned", "integer")
    .addColumn("stale", "integer")
    .addColumn("failed", "boolean")
    .addColumn("error_message", "text")
    .addColumn("status", "text", (column) => column.notNull().defaultTo("running"))
    .addColumn("trigger", "text", (column) => column.notNull().defaultTo("cli"))
    .addColumn("action_run_id", "text", (column) => column.notNull().defaultTo("legacy"))
    .addColumn("schedule_id", "text")
    .addColumn("attempt", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("heartbeat_at", "text")
    .addColumn("error_code", "text")
    .execute();

  await sql`ALTER TABLE platform_sync_runs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'running'`.execute(db);
  await sql`ALTER TABLE platform_sync_runs ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'cli'`.execute(db);
  await sql`ALTER TABLE platform_sync_runs ADD COLUMN IF NOT EXISTS action_run_id text NOT NULL DEFAULT 'legacy'`.execute(db);
  await sql`ALTER TABLE platform_sync_runs ADD COLUMN IF NOT EXISTS schedule_id text`.execute(db);
  await sql`ALTER TABLE platform_sync_runs ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1`.execute(db);
  await sql`ALTER TABLE platform_sync_runs ADD COLUMN IF NOT EXISTS heartbeat_at text`.execute(db);
  await sql`ALTER TABLE platform_sync_runs ADD COLUMN IF NOT EXISTS error_code text`.execute(db);

  await db.schema
    .createTable("platform_sync_schedules")
    .ifNotExists()
    .addColumn("schedule_id", "text", (column) => column.primaryKey())
    .addColumn("platform", "text", (column) => column.notNull())
    .addColumn("scope_key", "text", (column) => column.notNull())
    .addColumn("interval_seconds", "integer", (column) => column.notNull())
    .addColumn("enabled", "boolean", (column) => column.notNull())
    .addColumn("managed_by", "text", (column) => column.notNull())
    .addColumn("master_user_id", "text")
    .addColumn("target_json", "text", (column) => column.notNull())
    .addColumn("next_run_at", "text", (column) => column.notNull())
    .addColumn("retry_count", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("blocked_reason", "text")
    .addColumn("last_enqueued_at", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("platform_sync_leases")
    .ifNotExists()
    .addColumn("platform", "text", (column) => column.notNull())
    .addColumn("scope_key", "text", (column) => column.notNull())
    .addColumn("run_id", "text", (column) => column.notNull())
    .addColumn("lease_token", "text", (column) => column.notNull())
    .addColumn("lease_expires_at", "text", (column) => column.notNull())
    .addColumn("heartbeat_at", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("platform_sync_leases_pkey", ["platform", "scope_key"])
    .execute();

  await db.schema
    .createTable("meegle_workitem_octo")
    .ifNotExists()
    .addColumn("project_key", "text", (column) => column.notNull())
    .addColumn("work_item_type_key", "text", (column) => column.notNull())
    .addColumn("work_item_id", "text", (column) => column.notNull())
    .addColumn("local_json", "text", (column) => column.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("meegle_workitem_octo_pkey", ["project_key", "work_item_type_key", "work_item_id"])
    .execute();

  await db.schema
    .createTable("github_pr_octo")
    .ifNotExists()
    .addColumn("owner", "text", (column) => column.notNull())
    .addColumn("repo", "text", (column) => column.notNull())
    .addColumn("pull_number", "integer", (column) => column.notNull())
    .addColumn("local_json", "text", (column) => column.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("github_pr_octo_pkey", ["owner", "repo", "pull_number"])
    .execute();

  await db.schema
    .createTable("lark_base_ticket_octo")
    .ifNotExists()
    .addColumn("base_id", "text", (column) => column.notNull())
    .addColumn("table_id", "text", (column) => column.notNull())
    .addColumn("record_id", "text", (column) => column.notNull())
    .addColumn("shared_url", "text")
    .addColumn("ticket_ai", "text", (column) => column.notNull().defaultTo("{}"))
    .addColumn("shadow_ai", "text", (column) => column.notNull().defaultTo("{}"))
    .addColumn("local_json", "text", (column) => column.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("lark_base_ticket_octo_pkey", ["base_id", "table_id", "record_id"])
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS acp_kimi_session_owners_operator_idx
    ON acp_kimi_session_owners(operator_lark_id, updated_at)
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_github_id_unique
    ON users(github_id)
    WHERE github_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_lark_identity_unique
    ON users(lark_tenant_key, lark_id)
    WHERE lark_tenant_key IS NOT NULL AND lark_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_meegle_binding_unique
    ON users(meegle_base_url, meegle_user_key)
    WHERE meegle_base_url IS NOT NULL AND meegle_user_key IS NOT NULL
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS user_ssh_public_keys_user_idx
    ON user_ssh_public_keys(master_user_id, status)
  `.execute(db);
  await sql`
    ALTER TABLE user_ssh_public_keys
    ADD COLUMN IF NOT EXISTS public_key_fingerprint text
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS user_ssh_public_keys_fingerprint_unique
    ON user_ssh_public_keys(public_key_fingerprint)
    WHERE public_key_fingerprint IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS lark_contacts_email_unique
    ON lark_contacts(email)
    WHERE email IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS lark_contacts_meegle_user_key_unique
    ON lark_contacts(meegle_user_key)
    WHERE meegle_user_key IS NOT NULL
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS user_tokens_provider_lookup_idx
    ON user_tokens(provider, master_user_id, provider_tenant_key, external_user_key)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS oauth_sessions_provider_state_idx
    ON oauth_sessions(provider, state)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS web_sessions_user_expires_idx
    ON web_sessions(master_user_id, expires_at)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS github_pr_review_runs_user_updated_idx
    ON github_pr_review_runs(master_user_id, updated_at)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS meegle_workitem_syncs_status_idx
    ON meegle_workitem_syncs(project_key, status)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS github_pr_syncs_state_idx
    ON github_pr_syncs(owner, repo, state)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS lark_base_ticket_syncs_status_idx
    ON lark_base_ticket_syncs(base_id, table_id, ticket_status)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS lark_base_ticket_syncs_created_time_idx
    ON lark_base_ticket_syncs(created_time)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS lark_base_ticket_syncs_source_updated_at_idx
    ON lark_base_ticket_syncs(source_updated_at)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS lark_base_ticket_syncs_issue_type_idx
    ON lark_base_ticket_syncs(issue_type)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS platform_sync_runs_scope_started_idx
    ON platform_sync_runs(platform, scope_key, started_at DESC)
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS platform_sync_schedules_scope_unique
    ON platform_sync_schedules(platform, scope_key)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS platform_sync_schedules_due_idx
    ON platform_sync_schedules(enabled, next_run_at)
  `.execute(db);

  const now = new Date().toISOString();
  await db.insertInto("workflow_prompts")
    .values({
      key: STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY,
      prompt: DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_TEMPLATE,
      note: DEFAULT_STORY_PRD_TO_SIMPLIFIED_PROMPT_NOTE,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.column("key").doNothing())
    .execute();
  for (const prompt of [
    {
      key: LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY,
      prompt: DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATE,
      note: DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_NOTE,
    },
    {
      key: LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_KEY,
      prompt: DEFAULT_LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_TEMPLATE,
      note: DEFAULT_LARK_TICKET_SUPPORT_QA_ANSWER_PROMPT_NOTE,
    },
    {
      key: LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_KEY,
      prompt: DEFAULT_LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_TEMPLATE,
      note: DEFAULT_LARK_TICKET_SUPPORT_QA_DOCUMENT_PREVIEW_PROMPT_NOTE,
    },
  ]) {
    await db.insertInto("workflow_prompts")
      .values({
        ...prompt,
        created_at: now,
        updated_at: now,
      })
      .onConflict((conflict) => conflict.column("key").doNothing())
      .execute();
  }
  await migrateLegacyLarkTicketSupportQaSummaryPrompt(db, now);

  await db.insertInto("workflow_prompts")
    .values({
      key: GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_KEY,
      prompt: DEFAULT_GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_TEMPLATE,
      note: DEFAULT_GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_NOTE,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.column("key").doNothing())
    .execute();

  await db.insertInto("workflow_prompts")
    .values({
      key: GITHUB_PR_QUICK_SCAN_PROMPT_KEY,
      prompt: DEFAULT_GITHUB_PR_QUICK_SCAN_PROMPT_TEMPLATE,
      note: DEFAULT_GITHUB_PR_QUICK_SCAN_PROMPT_NOTE,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.column("key").doNothing())
    .execute();

  await db.insertInto("workflow_prompts")
    .values({
      key: GITHUB_PR_DEEP_REVIEW_PROMPT_KEY,
      prompt: DEFAULT_GITHUB_PR_DEEP_REVIEW_PROMPT_TEMPLATE,
      note: DEFAULT_GITHUB_PR_DEEP_REVIEW_PROMPT_NOTE,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.column("key").doNothing())
    .execute();

  await db.insertInto("workflow_prompts")
    .values({
      key: LARK_BUG_ANALYZE_PROMPT_KEY,
      prompt: DEFAULT_LARK_BUG_ANALYZE_PROMPT_TEMPLATE,
      note: DEFAULT_LARK_BUG_ANALYZE_PROMPT_NOTE,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.column("key").doNothing())
    .execute();

  await sql`
    ALTER TABLE acp_kimi_session_owners
    ADD COLUMN IF NOT EXISTS deleted_at text
  `.execute(db);
  await sql`
    ALTER TABLE acp_kimi_session_owners
    ADD COLUMN IF NOT EXISTS title text
  `.execute(db);
  for (const column of ["ticket_base_id", "ticket_table_id", "ticket_record_id", "ticket_number"]) {
    await sql.raw(`ALTER TABLE acp_kimi_session_owners ADD COLUMN IF NOT EXISTS ${column} text`).execute(db);
  }
  await sql`
    CREATE INDEX IF NOT EXISTS acp_kimi_sprint_session_refs_lookup_idx
    ON acp_kimi_sprint_session_refs(operator_lark_id, project_key, sprint_id, updated_at)
  `.execute(db);
  await db.insertInto("workflow_prompts")
    .values({
      key: MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_KEY,
      prompt: DEFAULT_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_TEMPLATE,
      note: DEFAULT_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_NOTE,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.column("key").doNothing())
    .execute();
  await db.updateTable("workflow_prompts")
    .set({
      prompt: DEFAULT_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_TEMPLATE,
      note: DEFAULT_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_NOTE,
      updated_at: now,
    })
    .where("key", "=", MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_KEY)
    .where("prompt", "=", LEGACY_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_TEMPLATE)
    .execute();
  for (const prompt of [
    {
      key: MEEGLE_SPRINT_INTERNAL_SUMMARY_PROMPT_KEY,
      prompt: DEFAULT_MEEGLE_SPRINT_INTERNAL_SUMMARY_PROMPT_TEMPLATE,
      note: DEFAULT_MEEGLE_SPRINT_INTERNAL_SUMMARY_PROMPT_NOTE,
    },
    {
      key: MEEGLE_SPRINT_CONFIRM_GAPS_PROMPT_KEY,
      prompt: DEFAULT_MEEGLE_SPRINT_CONFIRM_GAPS_PROMPT_TEMPLATE,
      note: DEFAULT_MEEGLE_SPRINT_CONFIRM_GAPS_PROMPT_NOTE,
    },
  ]) {
    await db.insertInto("workflow_prompts")
      .values({ ...prompt, created_at: now, updated_at: now })
      .onConflict((conflict) => conflict.column("key").doNothing())
      .execute();
  }
  for (const column of ["runtime_host_name", "kimi_work_dir"]) {
    await sql.raw(`ALTER TABLE acp_kimi_session_owners ADD COLUMN IF NOT EXISTS ${column} text`).execute(db);
  }
  for (const column of ["automation_action_key", "execution_policy", "skill_profile", "skill_id", "policy_version"]) {
    await sql.raw(`ALTER TABLE acp_kimi_session_owners ADD COLUMN IF NOT EXISTS ${column} text`).execute(db);
  }
  for (const column of ["thread_id", "thread_context_synced_at"]) {
    await sql.raw(`ALTER TABLE acp_kimi_session_owners ADD COLUMN IF NOT EXISTS ${column} text`).execute(db);
  }
  await sql`
    ALTER TABLE acp_kimi_session_owners
    ADD COLUMN IF NOT EXISTS thread_snapshot_version integer
  `.execute(db);
  for (const column of ["action_run_id", "run_status", "run_error_code", "run_error_message", "unverified_output"]) {
    await sql.raw(`ALTER TABLE acp_kimi_session_owners ADD COLUMN IF NOT EXISTS ${column} text`).execute(db);
  }
  await sql`
    CREATE INDEX IF NOT EXISTS acp_kimi_session_owners_ticket_idx
    ON acp_kimi_session_owners(operator_lark_id, ticket_base_id, ticket_table_id, ticket_record_id, updated_at)
  `.execute(db);
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS lark_name text
  `.execute(db);
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS lark_avatar_url text
  `.execute(db);
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role text
  `.execute(db);
  await sql`
    ALTER TABLE lark_contacts
    ADD COLUMN IF NOT EXISTS email text
  `.execute(db);
  await sql`
    ALTER TABLE lark_contacts
    ADD COLUMN IF NOT EXISTS name text
  `.execute(db);
  await sql`
    ALTER TABLE lark_contacts
    ADD COLUMN IF NOT EXISTS meegle_user_key text
  `.execute(db);
  await sql`
    ALTER TABLE github_pr_review_runs
    ADD COLUMN IF NOT EXISTS feedback_count integer
  `.execute(db);
  await sql`
    ALTER TABLE github_pr_review_runs
    ADD COLUMN IF NOT EXISTS feedback_record_ids_json text
  `.execute(db);
  await sql`
    ALTER TABLE github_pr_syncs
    ADD COLUMN IF NOT EXISTS description text
  `.execute(db);
  await sql`
    ALTER TABLE github_pr_syncs
    ADD COLUMN IF NOT EXISTS meegle_ids text NOT NULL DEFAULT '[]'
  `.execute(db);
  for (const column of ["merged_by_login", "reviewers_json", "labels_json", "created_at"]) {
    await sql.raw(`ALTER TABLE github_pr_syncs ADD COLUMN IF NOT EXISTS ${column} text`).execute(db);
  }
  for (const column of ["ticket_number", "issue_type", "requester", "responsible", "priority", "detail_description", "meegle_link", "lark_message_link"]) {
    await sql.raw(`ALTER TABLE lark_base_ticket_syncs ADD COLUMN IF NOT EXISTS ${column} text`).execute(db);
  }
  for (const table of ["meegle_workitem_syncs", "github_pr_syncs", "lark_base_ticket_syncs"]) {
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS last_seen_at text`).execute(db);
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS stale boolean NOT NULL DEFAULT false`).execute(db);
  }
  for (const table of ["meegle_workitem_octo", "github_pr_octo", "lark_base_ticket_octo"]) {
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS local_json text NOT NULL DEFAULT '{}'`).execute(db);
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS created_at text`).execute(db);
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_at text`).execute(db);
    for (const column of ["source_fingerprint", "cleaning_version", "cleaned_json", "cleaned_at"]) {
      await sql.raw(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`).execute(db);
    }
  }
  await sql`
    ALTER TABLE lark_base_ticket_octo
    ADD COLUMN IF NOT EXISTS shared_url text
  `.execute(db);
  await sql`
    ALTER TABLE lark_base_ticket_octo
    ADD COLUMN IF NOT EXISTS ticket_ai text NOT NULL DEFAULT '{}'
  `.execute(db);
  await sql`
    ALTER TABLE lark_base_ticket_octo
    ADD COLUMN IF NOT EXISTS shadow_ai text NOT NULL DEFAULT '{}'
  `.execute(db);
  await sql`
    INSERT INTO lark_base_ticket_octo (
      base_id, table_id, record_id, shared_url, local_json, created_at, updated_at
    )
    SELECT base_id, table_id, record_id, shared_url, '{}', synced_at, synced_at
    FROM lark_base_ticket_syncs
    WHERE shared_url IS NOT NULL
    ON CONFLICT (base_id, table_id, record_id) DO UPDATE
    SET shared_url = COALESCE(lark_base_ticket_octo.shared_url, EXCLUDED.shared_url)
  `.execute(db);
  await sql`
    ALTER TABLE meegle_workitem_syncs
    ADD COLUMN IF NOT EXISTS work_item_type text
  `.execute(db);
  await sql`
    ALTER TABLE meegle_workitem_syncs
    ADD COLUMN IF NOT EXISTS project_name text
  `.execute(db);
  await sql`
    ALTER TABLE meegle_workitem_syncs
    ADD COLUMN IF NOT EXISTS status_key text
  `.execute(db);
  await sql`
    ALTER TABLE meegle_workitem_syncs
    ADD COLUMN IF NOT EXISTS sub_stage_key text
  `.execute(db);
  await sql`
    ALTER TABLE meegle_workitem_syncs
    ADD COLUMN IF NOT EXISTS sub_stage text
  `.execute(db);
  for (const column of ["sprint_id", "sprint", "version", "system", "bugs_json", "priority"]) {
    await sql.raw(`ALTER TABLE meegle_workitem_syncs ADD COLUMN IF NOT EXISTS ${column} text`).execute(db);
  }
  for (const column of ["add_to_cycle_time", "current_node_start_time", "item_start_time", "item_finish_time"]) {
    await sql.raw(`ALTER TABLE meegle_workitem_syncs ADD COLUMN IF NOT EXISTS ${column} text`).execute(db);
  }
  await sql`ALTER TABLE meegle_workitem_syncs ADD COLUMN IF NOT EXISTS created_at text`.execute(db);
  await sql`ALTER TABLE meegle_workitem_syncs DROP COLUMN IF EXISTS item_cycle_tag`.execute(db);
  for (const column of [
    "planned_sprint", "planned_version", "linked_project", "linked_bugs_json", "relevant_system",
    "linked_sprint", "linked_version", "associated_bugs_json", "linked_story",
  ]) {
    await sql.raw(`ALTER TABLE meegle_workitem_syncs DROP COLUMN IF EXISTS ${column}`).execute(db);
  }
}

export async function migrateLegacyLarkTicketSupportQaSummaryPrompt(
  db: Kysely<DatabaseSchema>,
  updatedAt: string,
): Promise<void> {
  await db.updateTable("workflow_prompts")
    .set({
      prompt: DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATE,
      note: DEFAULT_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_NOTE,
      updated_at: updatedAt,
    })
    .where("key", "=", LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_KEY)
    .where("prompt", "in", LEGACY_LARK_TICKET_SUPPORT_QA_SUMMARIZE_PROMPT_TEMPLATES)
    .execute();
}

export async function renameLegacyUserSshPublicKeyIdColumn(db: Kysely<DatabaseSchema>): Promise<void> {
  try {
    await sql`ALTER TABLE user_ssh_public_keys RENAME COLUMN key_id TO id`.execute(db);
  } catch (error) {
    if (!isUndefinedColumn(error, "key_id")) throw error;
  }
}

function isUndefinedColumn(error: unknown, column: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "42703")
    || error instanceof Error && new RegExp(`column\\s+"?${column}"?\\s+(?:does not exist|not found)`, "i").test(error.message);
}

export async function resetPostgresDatabase(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`DROP TABLE IF EXISTS platform_sync_leases`.execute(db);
  await sql`DROP TABLE IF EXISTS platform_sync_schedules`.execute(db);
  await sql`DROP TABLE IF EXISTS platform_sync_runs`.execute(db);
  await sql`DROP TABLE IF EXISTS platform_sync_checkpoints`.execute(db);
  await sql`DROP TABLE IF EXISTS lark_base_ticket_octo`.execute(db);
  await sql`DROP TABLE IF EXISTS github_pr_octo`.execute(db);
  await sql`DROP TABLE IF EXISTS meegle_workitem_octo`.execute(db);
  await sql`DROP TABLE IF EXISTS lark_ticket_thread_syncs`.execute(db);
  await sql`DROP TABLE IF EXISTS lark_base_ticket_syncs`.execute(db);
  await sql`DROP TABLE IF EXISTS github_pr_syncs`.execute(db);
  await sql`DROP TABLE IF EXISTS meegle_sync_mappings`.execute(db);
  await sql`DROP TABLE IF EXISTS meegle_workitem_sprint_memberships`.execute(db);
  await sql`DROP TABLE IF EXISTS meegle_workitem_role_members`.execute(db);
  await sql`DROP TABLE IF EXISTS meegle_workitem_syncs`.execute(db);
  await sql`DROP TABLE IF EXISTS github_pr_review_runs`.execute(db);
  await sql`DROP TABLE IF EXISTS web_plugin_login_challenges`.execute(db);
  await sql`DROP TABLE IF EXISTS web_sessions`.execute(db);
  await sql`DROP TABLE IF EXISTS workflow_prompts`.execute(db);
  await sql`DROP TABLE IF EXISTS acp_kimi_sprint_session_refs`.execute(db);
  await sql`DROP TABLE IF EXISTS acp_kimi_session_owners`.execute(db);
  await sql`DROP TABLE IF EXISTS oauth_sessions`.execute(db);
  await sql`DROP TABLE IF EXISTS user_tokens`.execute(db);
  await sql`DROP TABLE IF EXISTS lark_contacts`.execute(db);
  await sql`DROP TABLE IF EXISTS user_ssh_public_keys`.execute(db);
  await sql`DROP TABLE IF EXISTS users`.execute(db);
  await ensurePostgresSchema(db);
}

let sharedDatabase: Kysely<DatabaseSchema> | undefined;
let sharedConnection: PreparedPostgresConnection | undefined;

export function getSharedDatabase(): Kysely<DatabaseSchema> {
  if (!sharedDatabase) {
    if (process.env.DATABASE_SSH_ENABLED === "true" || process.env.DATABASE_SSH_ENABLED === "1") {
      throw new Error("SSH tunnel is not ready; await ensureSharedDatabase() before using the shared database");
    }
    sharedDatabase = createPostgresDatabase();
  }

  return sharedDatabase;
}

let sharedDatabaseReady: Promise<Kysely<DatabaseSchema>> | undefined;

export async function ensureSharedDatabase(): Promise<Kysely<DatabaseSchema>> {
  if (!sharedDatabaseReady) {
    sharedDatabaseReady = (async () => {
      const postgresUri = getDefaultPostgresUri();
      if (!postgresUri) {
        throw new Error("POSTGRES_URI is not configured");
      }
      sharedConnection = await preparePostgresConnection(postgresUri);
      sharedDatabase = createPostgresDatabase(sharedConnection.postgresUri);
      const db = sharedDatabase;
      await ensurePostgresSchema(db);
      return db;
    })().catch(async (error: unknown) => {
      await sharedDatabase?.destroy();
      sharedDatabase = undefined;
      await sharedConnection?.close();
      sharedConnection = undefined;
      sharedDatabaseReady = undefined;
      throw error;
    });
  }

  return sharedDatabaseReady;
}

export async function closeSharedDatabase(): Promise<void> {
  const db = sharedDatabase;
  const connection = sharedConnection;
  sharedDatabase = undefined;
  sharedConnection = undefined;
  sharedDatabaseReady = undefined;

  await db?.destroy();
  await connection?.close();
}
