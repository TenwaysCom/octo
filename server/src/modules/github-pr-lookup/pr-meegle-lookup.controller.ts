/**
 * PR Meegle Lookup Controller
 */

import { executePrMeegleLookup } from "./pr-meegle-lookup.service.js";
import { validatePrMeegleLookupRequest } from "./pr-meegle-lookup.dto.js";
import { ZodError } from "zod";
import { logger } from "../../logger.js";

const controllerLogger = logger.child({ module: "pr-meegle-lookup-controller" });

function toInvalidRequest(error: ZodError) {
  return {
    ok: false as const,
    error: {
      errorCode: "INVALID_REQUEST" as const,
      errorMessage: error.message,
    },
  };
}

export async function prMeegleLookupController(input: unknown) {
  controllerLogger.info("RECEIVED_REQUEST");
  try {
    const validated = validatePrMeegleLookupRequest(input);
    controllerLogger.debug({ masterUserId: validated.masterUserId }, "VALIDATED_REQUEST");
    return await executePrMeegleLookup(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    return {
      ok: false as const,
      error: {
        errorCode: "LOOKUP_FAILED" as const,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
