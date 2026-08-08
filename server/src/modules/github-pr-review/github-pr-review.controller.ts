import { ZodError } from "zod";
import { GitHubClient } from "../../adapters/github/github-client.js";
import {
  createActionErrorEnvelopeFromError,
  getActionRunId,
} from "../../application/action-error-envelope.js";
import {
  getGitHubPrReviewRun,
  submitGitHubPrReview,
} from "../../application/services/github-pr-review.service.js";
import {
  validateGitHubPrReviewRequest,
  validateGitHubPrCodeReviewFeedbackRequest,
  validateGitHubPrReviewStatusRequest,
} from "./github-pr-review.dto.js";

const MODULE = "github-pr-review";

export async function githubPrReviewController(input: unknown) {
  const actionRunId = getActionRunId(input);
  try {
    const request = validateGitHubPrReviewRequest(input);
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN is not configured on the server");
    }
    return await submitGitHubPrReview(request, {
      githubClient: new GitHubClient({ token }),
    });
  } catch (error) {
    return {
      ok: false as const,
      error: createActionErrorEnvelopeFromError(error, {
        module: MODULE,
        stage: error instanceof ZodError ? "server.action.received" : "server.workflow.failed",
        errorCode: error instanceof ZodError ? "INVALID_REQUEST" : "GITHUB_PR_REVIEW_FAILED",
        actionRunId,
      }),
    };
  }
}

export async function githubPrCodeReviewFeedbackController(input: unknown) {
  const actionRunId = getActionRunId(input);
  try {
    const request = validateGitHubPrCodeReviewFeedbackRequest(input);
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN is not configured on the server");
    }
    return await submitGitHubPrReview(request, {
      githubClient: new GitHubClient({ token }),
    });
  } catch (error) {
    return {
      ok: false as const,
      error: createActionErrorEnvelopeFromError(error, {
        module: MODULE,
        stage: error instanceof ZodError ? "server.action.received" : "server.workflow.failed",
        errorCode: error instanceof ZodError ? "INVALID_REQUEST" : "GITHUB_CODE_REVIEW_FEEDBACK_FAILED",
        actionRunId,
      }),
    };
  }
}

export async function githubPrReviewStatusController(input: unknown) {
  const actionRunId = getActionRunId(input);
  try {
    const request = validateGitHubPrReviewStatusRequest(input);
    return await getGitHubPrReviewRun(request);
  } catch (error) {
    return {
      ok: false as const,
      error: createActionErrorEnvelopeFromError(error, {
        module: MODULE,
        stage: error instanceof ZodError ? "server.action.received" : "server.workflow.status",
        errorCode: error instanceof ZodError ? "INVALID_REQUEST" : "GITHUB_PR_REVIEW_STATUS_FAILED",
        actionRunId,
      }),
    };
  }
}
