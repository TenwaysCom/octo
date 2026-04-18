import { ZodError } from "zod";
import {
  validateCreateLarkBaseBulkWorkflowRequest,
  validatePreviewLarkBaseBulkWorkflowRequest,
} from "./lark-base-workflow.dto.js";
import {
  executeLarkBaseBulkWorkflow,
  previewLarkBaseBulkWorkflow,
} from "./lark-base-bulk-workflow.service.js";

function toInvalidRequest(error: ZodError) {
  return {
    ok: false as const,
    error: {
      errorCode: "INVALID_REQUEST" as const,
      errorMessage: error.message,
    },
  };
}

export async function previewLarkBaseBulkWorkflowController(input: unknown) {
  try {
    const validated = validatePreviewLarkBaseBulkWorkflowRequest(input);
    return await previewLarkBaseBulkWorkflow(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    return {
      ok: false as const,
      error: {
        errorCode: "UPDATE_FAILED" as const,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function createLarkBaseBulkWorkflowController(input: unknown) {
  try {
    const validated = validateCreateLarkBaseBulkWorkflowRequest(input);
    return await executeLarkBaseBulkWorkflow(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    return {
      ok: false as const,
      error: {
        errorCode: "UPDATE_FAILED" as const,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
