import { ZodError } from "zod";
import {
  checkAuthStatus,
  exchangeAuthCode,
  refreshAuthToken,
} from "./meegle-auth.service.js";
import {
  validateMeegleAuthExchangeRequest,
  validateMeegleAuthRefreshRequest,
  validateMeegleAuthStatusRequest,
} from "./meegle-auth.dto.js";

function toInvalidRequest(error: ZodError) {
  return {
    ok: false as const,
    error: {
      errorCode: "INVALID_REQUEST",
      errorMessage: error.message,
    },
  };
}

export async function exchangeAuthCodeController(input: unknown) {
  try {
    validateMeegleAuthExchangeRequest(input);
    return await exchangeAuthCode(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    if (error instanceof Error && error.message === "Meegle auth adapter is not configured") {
      return {
        ok: false as const,
        error: {
          errorCode: "MEEGLE_AUTH_NOT_CONFIGURED",
          errorMessage: error.message,
        },
      };
    }

    throw error;
  }
}

export async function getAuthStatusController(input: unknown) {
  try {
    const request = validateMeegleAuthStatusRequest(input);
    return await checkAuthStatus(request);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    if (error instanceof Error && error.message === "Meegle auth adapter is not configured") {
      const request = input as {
        masterUserId?: string;
        meegleUserKey?: string;
        baseUrl?: string;
      };

      return {
        ok: true as const,
        data: {
          status: "require_auth_code" as const,
          masterUserId: request.masterUserId,
          meegleUserKey: request.meegleUserKey,
          baseUrl: request.baseUrl ?? "https://project.larksuite.com",
          reason: "Meegle auth is not configured",
        },
      };
    }

    throw error;
  }
}

export async function refreshAuthCodeController(input: unknown) {
  try {
    validateMeegleAuthRefreshRequest(input);
    return await refreshAuthToken(input);
  } catch (error) {
    if (error instanceof ZodError) {
      return toInvalidRequest(error);
    }

    if (error instanceof Error && error.message === "Meegle auth adapter is not configured") {
      return {
        ok: false as const,
        error: {
          errorCode: "MEEGLE_AUTH_NOT_CONFIGURED",
          errorMessage: error.message,
        },
      };
    }

    throw error;
  }
}
