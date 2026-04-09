import { applyB1, analyzeA2, createB1Draft } from "../../application/services/a2-workflow.service.js";
import { MeegleApplyError } from "../../application/services/meegle-apply.service.js";
import {
  validateA2ApplyRequest,
  validateA2RecordRequest,
} from "./a2.dto.js";
import { ZodError } from "zod";

function toInvalidRequest(error: ZodError) {
  return {
    ok: false as const,
    error: {
      errorCode: "INVALID_REQUEST",
      errorMessage: error.message,
    },
  };
}

function toApplyBusinessError(error: MeegleApplyError) {
  return {
    ok: false as const,
    error: {
      errorCode: error.errorCode,
      errorMessage: error.message,
    },
  };
}

export async function analyzeA2Controller(input: unknown) {
  try {
    return await analyzeA2(validateA2RecordRequest(input));
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    throw error;
  }
}

export async function createB1DraftController(input: unknown) {
  try {
    return await createB1Draft(validateA2RecordRequest(input));
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    throw error;
  }
}

export async function applyB1Controller(input: unknown) {
  try {
    return await applyB1(validateA2ApplyRequest(input));
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    if (error instanceof MeegleApplyError) {
      return toApplyBusinessError(error);
    }

    throw error;
  }
}
