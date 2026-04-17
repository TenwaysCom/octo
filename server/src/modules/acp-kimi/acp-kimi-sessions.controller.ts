import { ZodError } from "zod";
import {
  validateAcpKimiSessionListRequest,
  validateAcpKimiSessionLookupRequest,
} from "./acp-kimi.dto.js";
import {
  acpKimiSessionHistoryService,
} from "../../application/services/acp-kimi-session-history.service.js";

export function createAcpKimiSessionListController(
  service = acpKimiSessionHistoryService,
) {
  return async function acpKimiSessionListController(input: unknown) {
    try {
      const request = validateAcpKimiSessionListRequest(input);
      return {
        ok: true,
        data: {
          sessions: await service.listSessions(request),
        },
      };
    } catch (error) {
      return toErrorEnvelope(error);
    }
  };
}

export function createAcpKimiSessionLoadController(
  service = acpKimiSessionHistoryService,
) {
  return async function acpKimiSessionLoadController(input: unknown) {
    try {
      const request = validateAcpKimiSessionLookupRequest(input);
      return {
        ok: true,
        data: await service.loadSession(request),
      };
    } catch (error) {
      return toErrorEnvelope(error);
    }
  };
}

export function createAcpKimiSessionDeleteController(
  service = acpKimiSessionHistoryService,
) {
  return async function acpKimiSessionDeleteController(input: unknown) {
    try {
      const request = validateAcpKimiSessionLookupRequest(input);
      return await service.deleteSession(request);
    } catch (error) {
      return toErrorEnvelope(error);
    }
  };
}

function toErrorEnvelope(error: unknown) {
  if (error instanceof ZodError) {
    return {
      ok: false,
      error: {
        errorCode: "INVALID_REQUEST",
        errorMessage: error.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      errorCode:
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "INTERNAL_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error),
    },
  };
}

export const acpKimiSessionListController = createAcpKimiSessionListController();
export const acpKimiSessionLoadController = createAcpKimiSessionLoadController();
export const acpKimiSessionDeleteController = createAcpKimiSessionDeleteController();
