import { ZodError } from "zod";
import {
  validateCreateLarkBaseBulkWorkflowRequest,
  validatePreviewLarkBaseBulkWorkflowRequest,
} from "./lark-base-workflow.dto.js";
import {
  executeLarkBaseBulkWorkflow,
  previewLarkBaseBulkWorkflow,
} from "./lark-base-bulk-workflow.service.js";
import {
  createActionErrorEnvelopeFromError,
  getActionRunId,
} from "../../application/action-error-envelope.js";

const MODULE = "lark-base-bulk-workflow";

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

export async function previewLarkBaseBulkWorkflowController(input: unknown) {
  const actionRunId = getActionRunId(input);
  try {
    const validated = validatePreviewLarkBaseBulkWorkflowRequest(input);
    return await previewLarkBaseBulkWorkflow(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error, input);
    }

    return {
      ok: false as const,
      error: createActionErrorEnvelopeFromError(error, {
        module: MODULE,
        stage: "server.workflow.failed",
        errorCode: "UPDATE_FAILED" as const,
        actionRunId,
      }),
    };
  }
}

export async function createLarkBaseBulkWorkflowController(input: unknown) {
  const actionRunId = getActionRunId(input);
  try {
    const validated = validateCreateLarkBaseBulkWorkflowRequest(input);
    return await executeLarkBaseBulkWorkflow(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error, input);
    }

    return {
      ok: false as const,
      error: createActionErrorEnvelopeFromError(error, {
        module: MODULE,
        stage: "server.workflow.failed",
        errorCode: "UPDATE_FAILED" as const,
        actionRunId,
      }),
    };
  }
}
