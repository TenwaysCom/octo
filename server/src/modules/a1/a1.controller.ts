import { applyB2, analyzeA1, createB2Draft } from "../../application/services/a1-workflow.service.js";
import { MeegleApplyError } from "../../application/services/meegle-apply.service.js";
import {
  validateA1ApplyRequest,
  validateA1RecordRequest,
} from "./a1.dto.js";
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

export async function analyzeA1Controller(input: unknown) {
  try {
    return await analyzeA1(validateA1RecordRequest(input));
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    throw error;
  }
}

export async function createB2DraftController(input: unknown) {
  try {
    return await createB2Draft(validateA1RecordRequest(input));
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    throw error;
  }
}

export async function applyB2Controller(input: unknown) {
  try {
    return await applyB2(validateA1ApplyRequest(input));
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
