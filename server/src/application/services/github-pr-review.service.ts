import { GitHubClient } from "../../adapters/github/github-client.js";
import type { GitHubPullRequestFile } from "../../adapters/github/github-types.js";
import {
  getResolvedUserStore,
  type ResolvedUserStore,
} from "../../adapters/postgres/resolved-user-store.js";
import {
  getWorkflowPromptStore,
  type WorkflowPromptStore,
} from "../../adapters/postgres/workflow-prompt-store.js";
import {
  getGitHubPrReviewRunStore,
  type GitHubPrReviewRunStore,
} from "../../adapters/postgres/github-pr-review-run-store.js";
import {
  GITHUB_PR_DEEP_REVIEW_PROMPT_KEY,
  GITHUB_PR_QUICK_SCAN_PROMPT_KEY,
  renderWorkflowPromptTemplate,
} from "../../domain/workflow-prompts.js";
import type { GitHubPrReviewRequest } from "../../modules/github-pr-review/github-pr-review.dto.js";
import type { GitHubPrCodeReviewFeedbackRequest } from "../../modules/github-pr-review/github-pr-review.dto.js";
import {
  acpKimiProxyService,
  type AcpKimiProxyService,
} from "./acp-kimi-proxy.service.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import { logger } from "../../logger.js";
import { randomUUID } from "node:crypto";
import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { buildAuthenticatedLarkClient } from "./lark-auth-client.factory.js";
import { LarkBatchCreateError } from "../../adapters/lark/lark-client.js";
import {
  GITHUB_CODE_REVIEW_FEEDBACK_CATEGORIES,
  GITHUB_CODE_REVIEW_FEEDBACK_LARK_TARGET,
} from "../../modules/github-pr-review/github-code-review-feedback.config.js";
import { GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_KEY } from "../../domain/workflow-prompts.js";

const reviewLogger = logger.child({ module: "github-pr-review" });
const MAX_DIFF_CHARS = 180_000;
const MAX_COMMENT_CHARS = 60_000;

export interface GitHubPrReviewServiceDeps {
  githubClient: GitHubClient;
  resolvedUserStore?: ResolvedUserStore;
  workflowPromptStore?: WorkflowPromptStore;
  acpService?: AcpKimiProxyService;
  reviewRunStore?: GitHubPrReviewRunStore;
  euOdooGuideRoot?: string;
  validateEuOdooGuideRoot?: (guideRoot: string) => Promise<void>;
  createFeedbackLarkClient?: (masterUserId: string) => Promise<GitHubFeedbackLarkClient>;
}

type GitHubPrReviewOperation = GitHubPrReviewRequest["operation"] | GitHubPrCodeReviewFeedbackRequest["operation"];
type GitHubPrReviewActionRequest = Omit<GitHubPrReviewRequest, "operation"> & { operation: GitHubPrReviewOperation };

type GitHubFeedbackLarkClient = {
  getFields(baseId: string, tableId: string): Promise<Array<{ field_id: string; field_name: string }>>;
  batchCreateRecords(
    baseId: string,
    tableId: string,
    records: Array<Record<string, unknown>>,
  ): Promise<Array<{ record_id: string }>>;
};

const feedbackSchema = z.object({
  category: z.enum(GITHUB_CODE_REVIEW_FEEDBACK_CATEGORIES),
  files: z.string().trim().min(1),
  description: z.string().trim().min(1),
});
const feedbackPayloadSchema = z.object({ feedbacks: z.array(feedbackSchema).min(1) });
type CodeReviewFeedback = z.infer<typeof feedbackSchema>;

class FeedbackWriteError extends Error {
  constructor(
    message: string,
    readonly feedbackRecordIds: string[],
  ) {
    super(message);
  }
}

export async function submitGitHubPrReview(
  request: GitHubPrReviewActionRequest,
  deps: GitHubPrReviewServiceDeps,
) {
  const actionRunId = request.actionRunId ?? randomUUID();
  const normalizedRequest = { ...request, actionRunId };
  const reviewRunStore = deps.reviewRunStore ?? getGitHubPrReviewRunStore();
  const existing = await reviewRunStore.get(actionRunId);
  if (existing) {
    if (existing.masterUserId !== request.masterUserId) {
      throw new Error("GITHUB_PR_REVIEW_RUN_FORBIDDEN: action run belongs to a different user");
    }
    return {
      ok: true as const,
      data: {
        actionRunId,
        status: existing.status,
      },
    };
  }

  await reviewRunStore.create({
    actionRunId,
    masterUserId: normalizedRequest.masterUserId,
    operation: normalizedRequest.operation,
    prUrl: normalizedRequest.prUrl,
  });
  queueMicrotask(() => {
    void runQueuedGitHubPrReview(normalizedRequest, deps, reviewRunStore);
  });

  reviewLogger.info({
    actionRunId,
    operation: normalizedRequest.operation,
    stage: "server.workflow.queued",
  }, "server.workflow.queued");
  return {
    ok: true as const,
    data: {
      actionRunId,
      status: "queued" as const,
    },
  };
}

export async function getGitHubPrReviewRun(
  input: { actionRunId: string; masterUserId: string },
  reviewRunStore: GitHubPrReviewRunStore = getGitHubPrReviewRunStore(),
) {
  const run = await reviewRunStore.get(input.actionRunId);
  if (!run || run.masterUserId !== input.masterUserId) {
    throw new Error("GITHUB_PR_REVIEW_RUN_NOT_FOUND: review run was not found");
  }
  return {
    ok: true as const,
    data: {
      actionRunId: run.actionRunId,
      status: run.status,
      commentUrl: run.commentUrl,
      reviewedFiles: run.reviewedFiles,
      diffTruncated: run.diffTruncated,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      feedbackCount: run.feedbackCount,
      feedbackRecordIds: run.feedbackRecordIds,
    },
  };
}

async function runQueuedGitHubPrReview(
  request: GitHubPrReviewActionRequest & { actionRunId: string },
  deps: GitHubPrReviewServiceDeps,
  reviewRunStore: GitHubPrReviewRunStore,
): Promise<void> {
  await reviewRunStore.markRunning(request.actionRunId);
  try {
    const result = await executeGitHubPrReview(request, deps);
    await reviewRunStore.markSucceeded({
      actionRunId: request.actionRunId,
      commentUrl: result.data.commentUrl,
      reviewedFiles: result.data.reviewedFiles,
      diffTruncated: result.data.diffTruncated,
      feedbackCount: result.data.feedbackCount ?? null,
      feedbackRecordIds: result.data.feedbackRecordIds ?? [],
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = errorMessage.split(":", 1)[0] || "GITHUB_PR_REVIEW_FAILED";
    await reviewRunStore.markFailed({
      actionRunId: request.actionRunId,
      errorCode,
      errorMessage,
      feedbackCount: error instanceof FeedbackWriteError ? error.feedbackRecordIds.length : undefined,
      feedbackRecordIds: error instanceof FeedbackWriteError ? error.feedbackRecordIds : undefined,
    });
    reviewLogger.error({
      actionRunId: request.actionRunId,
      operation: request.operation,
      stage: "server.workflow.failed",
      errorCode,
      errorMessage,
    }, "server.workflow.failed");
  }
}

export async function executeGitHubPrReview(
  request: GitHubPrReviewActionRequest,
  deps: GitHubPrReviewServiceDeps,
) {
  const actionRunId = request.actionRunId;
  const parsed = deps.githubClient.parsePrUrl(request.prUrl);
  const resolvedUser = await (deps.resolvedUserStore ?? getResolvedUserStore())
    .getById(request.masterUserId);
  if (!resolvedUser?.larkId) {
    throw new Error("IDENTITY_NOT_FOUND: active Lark identity is required for PR review");
  }
  const euOdooGuideRoot = await resolveEuOdooGuideRoot(deps);

  reviewLogger.info({ actionRunId, ...parsed, operation: request.operation }, "server.workflow.started");
  const [pr, files] = await Promise.all([
    deps.githubClient.getPullRequest(parsed.owner, parsed.repo, parsed.pullNumber),
    deps.githubClient.getPullRequestFiles(parsed.owner, parsed.repo, parsed.pullNumber),
  ]);
  const diff = buildReviewDiff(files);
  if (!diff.content) {
    throw new Error("GITHUB_PR_DIFF_EMPTY: no changed Python or XML files with a textual diff");
  }

  const promptKey = request.operation === "github.pr.quick_scan"
    ? GITHUB_PR_QUICK_SCAN_PROMPT_KEY
    : request.operation === "github.pr.deep_review"
      ? GITHUB_PR_DEEP_REVIEW_PROMPT_KEY
      : GITHUB_PR_CODE_REVIEW_FEEDBACK_PROMPT_KEY;
  const prompt = await (deps.workflowPromptStore ?? getWorkflowPromptStore()).getByKey(promptKey);
  if (!prompt) {
    throw new Error(`WORKFLOW_PROMPT_NOT_FOUND: ${promptKey}`);
  }

  const reviewPrompt = renderWorkflowPromptTemplate(prompt.prompt, {
    pr_url: pr.html_url || request.prUrl,
    pr_title: pr.title || "",
    pr_description: pr.body || "",
    pr_diff: diff.content,
    diff_truncated: diff.truncated ? "是，内容已按字符上限截断" : "否",
  });
  const message = `${buildEuOdooGuideContext(euOdooGuideRoot)}\n\n${reviewPrompt}`;
  const feedbackLarkClient = request.operation === "github.pr.code_review_feedback"
    ? await createFeedbackLarkClient(request.masterUserId, deps)
    : undefined;
  const analysis = await runOneShotAnalysis(
    resolvedUser.larkId,
    message,
    deps.acpService ?? acpKimiProxyService,
  );
  if (!analysis) {
    throw new Error("ACP_EMPTY_RESULT: Kimi ACP returned an empty PR review");
  }

  if (request.operation === "github.pr.code_review_feedback") {
    const feedbacks = parseCodeReviewFeedback(analysis);
    await assertFeedbackLarkSchema(feedbackLarkClient!);
    const fields = feedbacks.map((feedback) => toLarkFeedbackFields(feedback, request.prUrl));
    let createdRecords: Array<{ record_id: string }> = [];
    try {
      createdRecords = await feedbackLarkClient!.batchCreateRecords(
        GITHUB_CODE_REVIEW_FEEDBACK_LARK_TARGET.baseId,
        GITHUB_CODE_REVIEW_FEEDBACK_LARK_TARGET.tableId,
        fields,
      );
    } catch (error) {
      const created = error instanceof LarkBatchCreateError
        ? error.createdRecords
        : createdRecords;
      throw new FeedbackWriteError(
        `LARK_BASE_WRITE_FAILED: ${error instanceof Error ? error.message : String(error)}`,
        created.map((record) => record.record_id),
      );
    }
    if (createdRecords.length !== feedbacks.length) {
      throw new FeedbackWriteError(
        `LARK_BASE_WRITE_FAILED: expected ${feedbacks.length} records, received ${createdRecords.length}`,
        createdRecords.map((record) => record.record_id),
      );
    }

    reviewLogger.info({
      actionRunId,
      ...parsed,
      operation: request.operation,
      feedbackCount: feedbacks.length,
      stage: "server.workflow.completed",
    }, "server.workflow.completed");
    return {
      ok: true as const,
      data: {
        updatedField: "lark_code_review_feedback",
        actionRunId,
        commentUrl: null,
        reviewedFiles: diff.reviewedFiles,
        diffTruncated: diff.truncated,
        feedbackCount: feedbacks.length,
        feedbackRecordIds: createdRecords.map((record) => record.record_id),
      },
    };
  }

  const mode = request.operation === "github.pr.quick_scan" ? "Quick scan" : "Deep review";
  const comment = buildReviewComment(mode, analysis, actionRunId);
  const createdComment = await deps.githubClient.createPullRequestComment(
    parsed.owner,
    parsed.repo,
    parsed.pullNumber,
    comment,
  );

  reviewLogger.info({
    actionRunId,
    ...parsed,
    operation: request.operation,
    reviewedFiles: diff.reviewedFiles,
    diffTruncated: diff.truncated,
    commentUrl: createdComment.html_url,
  }, "server.workflow.completed");
  return {
    ok: true as const,
    data: {
      updatedField: "github_pr_review",
      actionRunId,
      commentUrl: createdComment.html_url,
      reviewedFiles: diff.reviewedFiles,
      diffTruncated: diff.truncated,
      feedbackCount: null,
      feedbackRecordIds: [],
    },
  };
}

async function assertFeedbackLarkSchema(client: GitHubFeedbackLarkClient): Promise<void> {
  const fields = await client.getFields(
    GITHUB_CODE_REVIEW_FEEDBACK_LARK_TARGET.baseId,
    GITHUB_CODE_REVIEW_FEEDBACK_LARK_TARGET.tableId,
  );
  const expected = Object.values(GITHUB_CODE_REVIEW_FEEDBACK_LARK_TARGET.fields);
  const missing = expected.filter((field) => !fields.some(
    (actual) => actual.field_id === field.id && actual.field_name === field.name,
  ));
  if (missing.length > 0) {
    throw new Error(`LARK_BASE_SCHEMA_MISMATCH: missing or renamed fields ${missing.map((field) => field.name).join(", ")}`);
  }
}

async function createFeedbackLarkClient(
  masterUserId: string,
  deps: GitHubPrReviewServiceDeps,
): Promise<GitHubFeedbackLarkClient> {
  try {
    if (deps.createFeedbackLarkClient) {
      return await deps.createFeedbackLarkClient(masterUserId);
    }
    const { client } = await buildAuthenticatedLarkClient(
      masterUserId,
      "https://open.larksuite.com",
    );
    return client as GitHubFeedbackLarkClient;
  } catch (error) {
    throw new Error(`LARK_AUTH_REQUIRED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseCodeReviewFeedback(analysis: string): CodeReviewFeedback[] {
  try {
    return feedbackPayloadSchema.parse(JSON.parse(analysis)).feedbacks;
  } catch (error) {
    throw new Error(`ACP_STRUCTURED_OUTPUT_INVALID: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function toLarkFeedbackFields(
  feedback: CodeReviewFeedback,
  prUrl: string,
): Record<string, string> {
  const fields = GITHUB_CODE_REVIEW_FEEDBACK_LARK_TARGET.fields;
  return {
    [fields.template.name]: fields.template.option,
    [fields.category.name]: feedback.category,
    [fields.files.name]: feedback.files,
    [fields.description.name]: feedback.description,
    [fields.source.name]: prUrl,
  };
}

async function resolveEuOdooGuideRoot(
  deps: Pick<GitHubPrReviewServiceDeps, "euOdooGuideRoot" | "validateEuOdooGuideRoot">,
): Promise<string> {
  const guideRoot = (deps.euOdooGuideRoot ?? process.env.EU_ODOO_GUIDE_ROOT ?? "").trim();
  if (!guideRoot) {
    throw new Error("EU_ODOO_GUIDE_ROOT_NOT_CONFIGURED: configure an absolute EU Odoo guide directory before running PR review");
  }
  if (!isAbsolute(guideRoot)) {
    throw new Error("EU_ODOO_GUIDE_ROOT_INVALID: configured EU Odoo guide directory must be an absolute path");
  }

  await (deps.validateEuOdooGuideRoot ?? assertEuOdooGuideRootReadable)(guideRoot);
  return guideRoot;
}

async function assertEuOdooGuideRootReadable(guideRoot: string): Promise<void> {
  try {
    const metadata = await stat(guideRoot);
    if (!metadata.isDirectory()) {
      throw new Error("configured path is not a directory");
    }
    await access(guideRoot, fsConstants.R_OK | fsConstants.X_OK);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`EU_ODOO_GUIDE_ROOT_UNAVAILABLE: configured EU Odoo guide directory cannot be read (${reason})`);
  }
}

function buildEuOdooGuideContext(guideRoot: string): string {
  return [
    "## 必须遵循的 EU Odoo 指南",
    `在审查此 PR 前，必须读取并遵循以下目录中的指南文档：${guideRoot}`,
    "该指南是项目级审查的权威基线；若其中规定了规则，不得以通用 Odoo 经验替代。",
  ].join("\n");
}

function buildReviewDiff(files: GitHubPullRequestFile[]) {
  const reviewable = files.filter((file) => isReviewableFile(file.filename) && Boolean(file.patch));
  let content = "";
  let truncated = false;
  for (const file of reviewable) {
    const section = `\n\n### ${file.filename}\n\`\`\`diff\n${file.patch}\n\`\`\``;
    if (content.length + section.length > MAX_DIFF_CHARS) {
      truncated = true;
      break;
    }
    content += section;
  }
  return { content: content.trim(), reviewedFiles: reviewable.map((file) => file.filename), truncated };
}

function isReviewableFile(filename: string): boolean {
  const normalized = filename.toLowerCase();
  return (normalized.endsWith(".py") || normalized.endsWith(".xml")) &&
    !normalized.includes("/migrations/") &&
    !normalized.includes("/migration/") &&
    !normalized.includes("/i18n/");
}

async function runOneShotAnalysis(
  operatorLarkId: string,
  message: string,
  acpService: AcpKimiProxyService,
): Promise<string> {
  let text = "";
  await acpService.chatOneShot({ operatorLarkId, message }, (event) => {
    text += getAgentMessageText(event);
  });
  return text.trim();
}

function getAgentMessageText(event: AcpKimiStreamEvent): string {
  if (event.event !== "acp.session.update" || event.data.update.sessionUpdate !== "agent_message_chunk") {
    return "";
  }
  const content = event.data.update.content;
  if (!content || typeof content !== "object") {
    return "";
  }
  const textContent = content as { type?: unknown; text?: unknown };
  return textContent.type === "text" && typeof textContent.text === "string"
    ? textContent.text
    : "";
}

function buildReviewComment(mode: string, analysis: string, actionRunId?: string): string {
  const suffix = analysis.length > MAX_COMMENT_CHARS
    ? "\n\n> Review output was truncated to GitHub's comment limit."
    : "";
  return `<!-- octo:github-pr-review:${mode.toLowerCase().replaceAll(" ", "-")} -->\n## Octo ${mode}\n\n${analysis.slice(0, MAX_COMMENT_CHARS)}${suffix}\n\n---\nAction run: \`${actionRunId ?? "unknown"}\``;
}
