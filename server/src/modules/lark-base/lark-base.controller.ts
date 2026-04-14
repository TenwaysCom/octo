import { updateLarkBaseMeegleLink } from "./lark-base.service.js";
import { validateUpdateLarkBaseMeegleLinkRequest } from "./lark-base.dto.js";
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

export async function updateLarkBaseMeegleLinkController(input: unknown) {
  try {
    const validated = validateUpdateLarkBaseMeegleLinkRequest(input);
    return await updateLarkBaseMeegleLink(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    return {
      ok: false as const,
      error: {
        errorCode: "UPDATE_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
