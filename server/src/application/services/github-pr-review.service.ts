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
import {
  acpKimiProxyService,
  type AcpKimiProxyService,
} from "./acp-kimi-proxy.service.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import { logger } from "../../logger.js";
import { randomUUID } from "node:crypto";

const reviewLogger = logger.child({ module: "github-pr-review" });
const MAX_DIFF_CHARS = 180_000;
const MAX_COMMENT_CHARS = 60_000;

export interface GitHubPrReviewServiceDeps {
  githubClient: GitHubClient;
  resolvedUserStore?: ResolvedUserStore;
  workflowPromptStore?: WorkflowPromptStore;
  acpService?: AcpKimiProxyService;
  reviewRunStore?: GitHubPrReviewRunStore;
}

export async function submitGitHubPrReview(
  request: GitHubPrReviewRequest,
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
    },
  };
}

async function runQueuedGitHubPrReview(
  request: GitHubPrReviewRequest & { actionRunId: string },
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
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = errorMessage.split(":", 1)[0] || "GITHUB_PR_REVIEW_FAILED";
    await reviewRunStore.markFailed({
      actionRunId: request.actionRunId,
      errorCode,
      errorMessage,
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
  request: GitHubPrReviewRequest,
  deps: GitHubPrReviewServiceDeps,
) {
  const actionRunId = request.actionRunId;
  const parsed = deps.githubClient.parsePrUrl(request.prUrl);
  const resolvedUser = await (deps.resolvedUserStore ?? getResolvedUserStore())
    .getById(request.masterUserId);
  if (!resolvedUser?.larkId) {
    throw new Error("IDENTITY_NOT_FOUND: active Lark identity is required for PR review");
  }

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
    : GITHUB_PR_DEEP_REVIEW_PROMPT_KEY;
  const prompt = await (deps.workflowPromptStore ?? getWorkflowPromptStore()).getByKey(promptKey);
  if (!prompt) {
    throw new Error(`WORKFLOW_PROMPT_NOT_FOUND: ${promptKey}`);
  }

  const message = renderWorkflowPromptTemplate(prompt.prompt, {
    pr_url: pr.html_url || request.prUrl,
    pr_title: pr.title || "",
    pr_description: pr.body || "",
    pr_diff: diff.content,
    diff_truncated: diff.truncated ? "是，内容已按字符上限截断" : "否",
  });
  const analysis = await runOneShotAnalysis(
    resolvedUser.larkId,
    message,
    deps.acpService ?? acpKimiProxyService,
  );
  if (!analysis) {
    throw new Error("ACP_EMPTY_RESULT: Kimi ACP returned an empty PR review");
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
    },
  };
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
