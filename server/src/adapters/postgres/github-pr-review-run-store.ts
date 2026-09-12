import type { Kysely, Selectable } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export type GitHubPrReviewRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface GitHubPrReviewRun {
  actionRunId: string;
  masterUserId: string;
  operation: "github.pr.quick_scan" | "github.pr.deep_review" | "github.pr.code_review_feedback";
  prUrl: string;
  status: GitHubPrReviewRunStatus;
  commentUrl: string | null;
  reviewedFiles: string[];
  diffTruncated: boolean | null;
  feedbackCount: number | null;
  feedbackRecordIds: string[];
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface GitHubPrReviewRunStore {
  create(input: Pick<GitHubPrReviewRun, "actionRunId" | "masterUserId" | "operation" | "prUrl">): Promise<GitHubPrReviewRun>;
  get(actionRunId: string): Promise<GitHubPrReviewRun | undefined>;
  markRunning(actionRunId: string): Promise<void>;
  markSucceeded(input: Pick<GitHubPrReviewRun, "actionRunId" | "commentUrl" | "reviewedFiles" | "diffTruncated" | "feedbackCount" | "feedbackRecordIds">): Promise<void>;
  markFailed(input: Pick<GitHubPrReviewRun, "actionRunId" | "errorCode" | "errorMessage"> & Partial<Pick<GitHubPrReviewRun, "feedbackCount" | "feedbackRecordIds">>): Promise<void>;
}

function toRecord(row: Selectable<DatabaseSchema["github_pr_review_runs"]> | undefined): GitHubPrReviewRun | undefined {
  if (!row) return undefined;
  let reviewedFiles: string[] = [];
  let feedbackRecordIds: string[] = [];
  try {
    const parsed = JSON.parse(row.reviewed_files_json ?? "[]");
    reviewedFiles = Array.isArray(parsed) && parsed.every((value) => typeof value === "string") ? parsed : [];
  } catch {
    reviewedFiles = [];
  }
  try {
    const parsed = JSON.parse(row.feedback_record_ids_json ?? "[]");
    feedbackRecordIds = Array.isArray(parsed) && parsed.every((value) => typeof value === "string") ? parsed : [];
  } catch {
    feedbackRecordIds = [];
  }
  return {
    actionRunId: row.action_run_id,
    masterUserId: row.master_user_id,
    operation: row.operation as GitHubPrReviewRun["operation"],
    prUrl: row.pr_url,
    status: row.status as GitHubPrReviewRunStatus,
    commentUrl: row.comment_url,
    reviewedFiles,
    diffTruncated: row.diff_truncated,
    feedbackCount: row.feedback_count,
    feedbackRecordIds,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresGitHubPrReviewRunStore implements GitHubPrReviewRunStore {
  constructor(private readonly db?: Kysely<DatabaseSchema>) {}

  private get database(): Kysely<DatabaseSchema> {
    return this.db ?? getSharedDatabase();
  }

  async create(input: Pick<GitHubPrReviewRun, "actionRunId" | "masterUserId" | "operation" | "prUrl">): Promise<GitHubPrReviewRun> {
    const now = new Date().toISOString();
    await this.database.insertInto("github_pr_review_runs").values({
      action_run_id: input.actionRunId,
      master_user_id: input.masterUserId,
      operation: input.operation,
      pr_url: input.prUrl,
      status: "queued",
      comment_url: null,
      reviewed_files_json: null,
      diff_truncated: null,
      feedback_count: null,
      feedback_record_ids_json: null,
      error_code: null,
      error_message: null,
      created_at: now,
      started_at: null,
      completed_at: null,
      updated_at: now,
    }).execute();
    return (await this.get(input.actionRunId))!;
  }

  async get(actionRunId: string): Promise<GitHubPrReviewRun | undefined> {
    return toRecord(await this.database.selectFrom("github_pr_review_runs").selectAll()
      .where("action_run_id", "=", actionRunId).executeTakeFirst());
  }

  async markRunning(actionRunId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.database.updateTable("github_pr_review_runs").set({ status: "running", started_at: now, updated_at: now })
      .where("action_run_id", "=", actionRunId).execute();
  }

  async markSucceeded(input: Pick<GitHubPrReviewRun, "actionRunId" | "commentUrl" | "reviewedFiles" | "diffTruncated" | "feedbackCount" | "feedbackRecordIds">): Promise<void> {
    const now = new Date().toISOString();
    await this.database.updateTable("github_pr_review_runs").set({
      status: "succeeded", comment_url: input.commentUrl, reviewed_files_json: JSON.stringify(input.reviewedFiles),
      diff_truncated: input.diffTruncated, feedback_count: input.feedbackCount,
      feedback_record_ids_json: JSON.stringify(input.feedbackRecordIds), completed_at: now, updated_at: now,
    }).where("action_run_id", "=", input.actionRunId).execute();
  }

  async markFailed(input: Pick<GitHubPrReviewRun, "actionRunId" | "errorCode" | "errorMessage"> & Partial<Pick<GitHubPrReviewRun, "feedbackCount" | "feedbackRecordIds">>): Promise<void> {
    const now = new Date().toISOString();
    await this.database.updateTable("github_pr_review_runs").set({
      status: "failed", error_code: input.errorCode, error_message: input.errorMessage,
      feedback_count: input.feedbackCount ?? null,
      feedback_record_ids_json: input.feedbackRecordIds ? JSON.stringify(input.feedbackRecordIds) : null,
      completed_at: now, updated_at: now,
    }).where("action_run_id", "=", input.actionRunId).execute();
  }
}

let sharedGitHubPrReviewRunStore: GitHubPrReviewRunStore | undefined;

export function getGitHubPrReviewRunStore(): GitHubPrReviewRunStore {
  if (!sharedGitHubPrReviewRunStore) sharedGitHubPrReviewRunStore = new PostgresGitHubPrReviewRunStore();
  return sharedGitHubPrReviewRunStore;
}
