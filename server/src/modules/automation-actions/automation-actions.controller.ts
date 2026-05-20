import { ZodError } from "zod";
import {
  executeAutomationAction,
  listAutomationActions,
} from "./automation-actions.service.js";
import {
  validateAutomationActionExecuteRequest,
  validateAutomationActionListRequest,
} from "./automation-actions.dto.js";

function toInvalidRequest(error: ZodError) {
  return {
    ok: false as const,
    error: {
      errorCode: "INVALID_REQUEST",
      errorMessage: error.message,
    },
  };
}

export async function listAutomationActionsController(input: unknown) {
  try {
    return await listAutomationActions(validateAutomationActionListRequest(input));
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }
    throw error;
  }
}

export async function executeAutomationActionController(input: unknown) {
  try {
    return await executeAutomationAction(validateAutomationActionExecuteRequest(input));
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }
    throw error;
  }
}
