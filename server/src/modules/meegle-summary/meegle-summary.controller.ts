import {
  generateWorkitemSummary,
  applyWorkitemSummary,
  handleMeegleSummaryError,
} from "./meegle-summary.service.js";
import {
  validateGenerateSummaryRequest,
  validateApplySummaryRequest,
} from "./meegle-summary.dto.js";
import { ZodError } from "zod";
import { logger } from "../../logger.js";

const controllerLogger = logger.child({ module: "meegle-summary-controller" });

function toInvalidRequest(error: ZodError) {
  return {
    ok: false as const,
    error: {
      errorCode: "INVALID_REQUEST" as const,
      errorMessage: error.message,
    },
  };
}

export async function generateSummaryController(input: unknown) {
  controllerLogger.info({ input }, "GENERATE_SUMMARY_REQUEST");
  try {
    const validated = validateGenerateSummaryRequest(input);
    controllerLogger.debug({ validated }, "GENERATE_SUMMARY_VALIDATED");
    return await generateWorkitemSummary(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }
    controllerLogger.error({ error: error instanceof Error ? error.message : String(error) }, "GENERATE_SUMMARY_ERROR");
    return handleMeegleSummaryError(error);
  }
}

export async function applySummaryController(input: unknown) {
  controllerLogger.info({ input }, "APPLY_SUMMARY_REQUEST");
  try {
    const validated = validateApplySummaryRequest(input);
    controllerLogger.debug({ validated }, "APPLY_SUMMARY_VALIDATED");
    return await applyWorkitemSummary(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }
    controllerLogger.error({ error: error instanceof Error ? error.message : String(error) }, "APPLY_SUMMARY_ERROR");
    return handleMeegleSummaryError(error);
  }
}
