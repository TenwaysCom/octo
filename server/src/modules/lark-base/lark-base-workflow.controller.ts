import { executeLarkBaseWorkflow } from "./lark-base-workflow.service.js";
import { validateCreateLarkBaseWorkflowRequest } from "./lark-base-workflow.dto.js";
import { ZodError } from "zod";
import { logger } from "../../logger.js";
import {
  createActionErrorEnvelopeFromError,
  getActionRunId,
} from "../../application/action-error-envelope.js";

const controllerLogger = logger.child({ module: "lark-base-workflow-controller" });
const MODULE = "lark-base-workflow";

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

export async function createLarkBaseWorkflowController(input: unknown) {
  const actionRunId = getActionRunId(input);
  controllerLogger.info({ actionRunId, input }, "server.action.received");
  try {
    const validated = validateCreateLarkBaseWorkflowRequest(input);
    return await executeLarkBaseWorkflow(validated);
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
