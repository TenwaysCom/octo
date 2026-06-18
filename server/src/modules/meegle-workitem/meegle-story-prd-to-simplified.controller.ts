import { ZodError } from "zod";
import { executeMeegleStoryPrdToSimplified } from "../../application/services/meegle-story-prd-to-simplified.service.js";
import { validateMeegleStoryPrdToSimplifiedRequest } from "./meegle-story-prd-to-simplified.dto.js";

export async function meegleStoryPrdToSimplifiedController(input: unknown) {
  try {
    const validated = validateMeegleStoryPrdToSimplifiedRequest(input);
    return await executeMeegleStoryPrdToSimplified(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false as const,
        error: {
          layer: "server" as const,
          module: "meegle-story-prd-to-simplified",
          stage: "server.action.received",
          errorCode: "INVALID_REQUEST",
          errorMessage: error.message,
        },
      };
    }

    return {
      ok: false as const,
      error: {
        layer: "server" as const,
        module: "meegle-story-prd-to-simplified",
        stage: "server.workflow.completed",
        errorCode: "MEEGLE_STORY_PRD_TO_SIMPLIFIED_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
