import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { preparePostgresConnection, type PreparedPostgresConnection } from "./ssh-tunnel.js";
import type { DatabaseSchema } from "./schema.js";
import {
  DEFAULT_LARK_BUG_ANALYZE_PROMPT_NOTE,
  DEFAULT_LARK_BUG_ANALYZE_PROMPT_TEMPLATE,
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
  STORY_PRD_TO_SIMPLIFIED_PROMPT_KEY,
} from "../../domain/workflow-prompts.js";

function readPostgresUri(): string {
  return process.env.POSTGRES_URI || process.env.DATABASE_URL || "";
}

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
    .addColumn("deleted_at", "text")
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
    .addColumn("sprint", "text")
    .addColumn("version", "text")
    .addColumn("system", "text")
    .addColumn("bugs_json", "text")
    .addColumn("assignee", "text")
    .addColumn("payload_json", "text", (column) => column.notNull())
    .addColumn("source_updated_at", "text")
    .addColumn("synced_at", "text", (column) => column.notNull())
    .addColumn("last_seen_at", "text")
    .addColumn("stale", "boolean", (column) => column.notNull().defaultTo(false))
    .addPrimaryKeyConstraint("meegle_workitem_syncs_pkey", ["project_key", "work_item_type_key", "work_item_id"])
    .execute();

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
    .addColumn("responsible", "text")
    .addColumn("priority", "text")
    .addColumn("detail_description", "text")
    .addColumn("meegle_link", "text")
    .addColumn("lark_message_link", "text")
    .addPrimaryKeyConstraint("lark_base_ticket_syncs_pkey", ["base_id", "table_id", "record_id"])
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
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("platform_sync_checkpoints_pkey", ["platform", "scope_key"])
    .execute();

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
    CREATE INDEX IF NOT EXISTS platform_sync_runs_scope_started_idx
    ON platform_sync_runs(platform, scope_key, started_at DESC)
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
  for (const column of ["ticket_base_id", "ticket_table_id", "ticket_record_id"]) {
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
  for (const column of ["ticket_number", "issue_type", "responsible", "priority", "detail_description", "meegle_link", "lark_message_link"]) {
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
  for (const column of ["sprint", "version", "system", "bugs_json"]) {
    await sql.raw(`ALTER TABLE meegle_workitem_syncs ADD COLUMN IF NOT EXISTS ${column} text`).execute(db);
  }
  for (const column of [
    "planned_sprint", "planned_version", "linked_project", "linked_bugs_json", "relevant_system",
    "linked_sprint", "linked_version", "associated_bugs_json", "linked_story",
  ]) {
    await sql.raw(`ALTER TABLE meegle_workitem_syncs DROP COLUMN IF EXISTS ${column}`).execute(db);
  }
}

export async function resetPostgresDatabase(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`DROP TABLE IF EXISTS platform_sync_runs`.execute(db);
  await sql`DROP TABLE IF EXISTS platform_sync_checkpoints`.execute(db);
  await sql`DROP TABLE IF EXISTS lark_base_ticket_octo`.execute(db);
  await sql`DROP TABLE IF EXISTS github_pr_octo`.execute(db);
  await sql`DROP TABLE IF EXISTS meegle_workitem_octo`.execute(db);
  await sql`DROP TABLE IF EXISTS lark_base_ticket_syncs`.execute(db);
  await sql`DROP TABLE IF EXISTS github_pr_syncs`.execute(db);
  await sql`DROP TABLE IF EXISTS meegle_sync_mappings`.execute(db);
  await sql`DROP TABLE IF EXISTS meegle_workitem_syncs`.execute(db);
  await sql`DROP TABLE IF EXISTS github_pr_review_runs`.execute(db);
  await sql`DROP TABLE IF EXISTS web_plugin_login_challenges`.execute(db);
  await sql`DROP TABLE IF EXISTS web_sessions`.execute(db);
  await sql`DROP TABLE IF EXISTS workflow_prompts`.execute(db);
  await sql`DROP TABLE IF EXISTS acp_kimi_session_owners`.execute(db);
  await sql`DROP TABLE IF EXISTS oauth_sessions`.execute(db);
  await sql`DROP TABLE IF EXISTS user_tokens`.execute(db);
  await sql`DROP TABLE IF EXISTS lark_contacts`.execute(db);
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
