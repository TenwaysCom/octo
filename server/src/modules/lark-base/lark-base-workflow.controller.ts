import { executeLarkBaseWorkflow } from "./lark-base-workflow.service.js";
import { validateCreateLarkBaseWorkflowRequest } from "./lark-base-workflow.dto.js";
import { ZodError } from "zod";
import { logger } from "../../logger.js";

const controllerLogger = logger.child({ module: "lark-base-workflow-controller" });

function toInvalidRequest(error: ZodError) {
  return {
    ok: false as const,
    error: {
      errorCode: "INVALID_REQUEST" as const,
      errorMessage: error.message,
    },
  };
}

export async function createLarkBaseWorkflowController(input: unknown) {
  controllerLogger.info({ input }, "RECEIVED_REQUEST");
  try {
    const validated = validateCreateLarkBaseWorkflowRequest(input);
    return await executeLarkBaseWorkflow(validated);
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
