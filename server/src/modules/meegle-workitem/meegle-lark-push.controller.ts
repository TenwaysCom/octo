import { executeMeegleLarkPush } from "../../application/services/meegle-lark-push.service.js";
import { validateMeegleLarkPushRequest } from "./meegle-lark-push.dto.js";
import { ZodError } from "zod";
import { logger } from "../../logger.js";

const controllerLogger = logger.child({ module: "meegle-lark-push-controller" });

function toInvalidRequest(error: ZodError) {
  return {
    ok: false as const,
    error: {
      errorCode: "INVALID_REQUEST" as const,
      errorMessage: error.message,
    },
  };
}

export async function meegleLarkPushController(input: unknown) {
  controllerLogger.info({ input }, "RECEIVED_REQUEST");
  try {
    const validated = validateMeegleLarkPushRequest(input);
    controllerLogger.debug({ validated }, "VALIDATED_REQUEST");
    return await executeMeegleLarkPush(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    return {
      ok: false as const,
      error: {
        errorCode: "PUSH_FAILED" as const,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
