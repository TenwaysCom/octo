import { ZodError } from "zod";
import { executeMeegleStoryPrdToSimplified } from "../../application/services/meegle-story-prd-to-simplified.service.js";
import { validateMeegleStoryPrdToSimplifiedRequest } from "./meegle-story-prd-to-simplified.dto.js";
import {
  createActionErrorEnvelopeFromError,
  getActionRunId,
} from "../../application/action-error-envelope.js";

const MODULE = "meegle-story-prd-to-simplified";

export async function meegleStoryPrdToSimplifiedController(input: unknown) {
  const actionRunId = getActionRunId(input);
  try {
    const validated = validateMeegleStoryPrdToSimplifiedRequest(input);
    return await executeMeegleStoryPrdToSimplified(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false as const,
        error: createActionErrorEnvelopeFromError(error, {
          module: MODULE,
          stage: "server.action.received",
          errorCode: "INVALID_REQUEST",
          actionRunId,
        }),
      };
    }

    return {
      ok: false as const,
      error: createActionErrorEnvelopeFromError(error, {
        module: MODULE,
        stage: "server.workflow.failed",
        errorCode: "MEEGLE_STORY_PRD_TO_SIMPLIFIED_FAILED",
        actionRunId,
      }),
    };
  }
}
