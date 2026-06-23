import { executeMeegleLarkPush } from "../../application/services/meegle-lark-push.service.js";
import { validateMeegleLarkPushRequest } from "./meegle-lark-push.dto.js";
import { ZodError } from "zod";
import { logger } from "../../logger.js";
import {
  createActionErrorEnvelopeFromError,
  getActionRunId,
} from "../../application/action-error-envelope.js";

const controllerLogger = logger.child({ module: "meegle-lark-push-controller" });
const MODULE = "meegle-lark-push";

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

export async function meegleLarkPushController(input: unknown) {
  const actionRunId = getActionRunId(input);
  controllerLogger.info({ actionRunId, input }, "server.action.received");
  try {
    const validated = validateMeegleLarkPushRequest(input);
    controllerLogger.debug({ validated }, "VALIDATED_REQUEST");
    return await executeMeegleLarkPush(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error, input);
    }

    return {
      ok: false as const,
      error: createActionErrorEnvelopeFromError(error, {
        module: MODULE,
        stage: "server.workflow.failed",
        errorCode: "PUSH_FAILED" as const,
        actionRunId,
      }),
    };
  }
}
