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

const controllerLogger = logger.child({ module: "github-branch-create-controller" });

function toInvalidRequest(error: ZodError) {
  return {
    ok: false as const,
    error: {
      errorCode: "INVALID_REQUEST" as const,
      errorMessage: error.message,
    },
  };
}

export async function githubBranchPreviewController(input: unknown) {
  controllerLogger.info("RECEIVED_PREVIEW_REQUEST");
  try {
    const validated = validateGitHubBranchPreviewRequest(input);
    controllerLogger.debug({ masterUserId: validated.masterUserId }, "VALIDATED_PREVIEW_REQUEST");
    const result = await previewBranchCreate(validated);
    return result;
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }
    controllerLogger.warn({ error: error instanceof Error ? error.message : String(error) }, "PREVIEW_FAILED");
    return {
      ok: false as const,
      error: {
        errorCode: "PREVIEW_FAILED" as const,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function githubBranchCreateController(input: unknown) {
  controllerLogger.info("RECEIVED_CREATE_REQUEST");
  try {
    const validated = validateGitHubBranchCreateRequest(input);
    controllerLogger.debug({ masterUserId: validated.masterUserId, branchName: validated.branchName }, "VALIDATED_CREATE_REQUEST");

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return {
        ok: false as const,
        error: {
          errorCode: "GITHUB_NOT_CONFIGURED" as const,
          errorMessage: "GITHUB_TOKEN is not configured on the server",
        },
      };
    }

    const result = await executeBranchCreate(validated, {
      githubClient: new GitHubClient({ token: githubToken }),
    });
    return result;
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }
    controllerLogger.warn({ error: error instanceof Error ? error.message : String(error) }, "CREATE_FAILED");
    return {
      ok: false as const,
      error: {
        errorCode: "CREATE_FAILED" as const,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
