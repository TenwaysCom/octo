/**
 * GitHub Branch Create Controller
 */

import { ZodError } from "zod";
import { logger } from "../../logger.js";
import { GitHubClient } from "../../adapters/github/github-client.js";
import {
  validateGitHubBranchPreviewRequest,
  validateGitHubBranchCreateRequest,
} from "./github-branch-create.dto.js";
import {
  previewBranchCreate,
  executeBranchCreate,
} from "./github-branch-create.service.js";
import {
  createActionErrorEnvelopeFromError,
  getActionRunId,
} from "../../application/action-error-envelope.js";

const controllerLogger = logger.child({ module: "github-branch-create-controller" });
const MODULE = "github-branch-create";

function toInvalidRequest(error: ZodError, input: unknown) {
  return {
    ok: false as const,
    error: createActionErrorEnvelopeFromError(error, {
      module: MODULE,
      stage: "server.action.received",
      errorCode: "INVALID_REQUEST" as const,
      actionRunId: getActionRunId(input),
    }),
  };
}

export async function githubBranchPreviewController(input: unknown) {
  const actionRunId = getActionRunId(input);
  controllerLogger.info({ actionRunId }, "server.action.received");
  try {
    const validated = validateGitHubBranchPreviewRequest(input);
    controllerLogger.debug({
      masterUserId: validated.masterUserId,
      actionRunId: validated.actionRunId,
    }, "VALIDATED_PREVIEW_REQUEST");
    const result = await previewBranchCreate(validated);
    return result;
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error, input);
    }
    controllerLogger.warn({ error: error instanceof Error ? error.message : String(error) }, "PREVIEW_FAILED");
    return {
      ok: false as const,
      error: createActionErrorEnvelopeFromError(error, {
        module: MODULE,
        stage: "server.workflow.failed",
        errorCode: "PREVIEW_FAILED" as const,
        actionRunId,
      }),
    };
  }
}

export async function githubBranchCreateController(input: unknown) {
  const actionRunId = getActionRunId(input);
  controllerLogger.info({ actionRunId }, "server.action.received");
  try {
    const validated = validateGitHubBranchCreateRequest(input);
    controllerLogger.debug({
      masterUserId: validated.masterUserId,
      branchName: validated.branchName,
      actionRunId: validated.actionRunId,
    }, "VALIDATED_CREATE_REQUEST");

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return {
        ok: false as const,
        error: createActionErrorEnvelopeFromError(
          new Error("GITHUB_TOKEN is not configured on the server"),
          {
            module: MODULE,
            stage: "server.workflow.failed",
            errorCode: "GITHUB_NOT_CONFIGURED" as const,
            actionRunId: validated.actionRunId,
          },
        ),
      };
    }

    const result = await executeBranchCreate(validated, {
      githubClient: new GitHubClient({ token: githubToken }),
    });
    return result;
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error, input);
    }
    controllerLogger.warn({ error: error instanceof Error ? error.message : String(error) }, "CREATE_FAILED");
    return {
      ok: false as const,
      error: createActionErrorEnvelopeFromError(error, {
        module: MODULE,
        stage: "server.workflow.failed",
        errorCode: "CREATE_FAILED" as const,
        actionRunId,
      }),
    };
  }
}
