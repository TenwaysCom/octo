import { exchangeAuthCode, refreshAuthToken } from "./meegle-auth.service.js";
import { validateMeegleAuthStatusRequest } from "./meegle-auth.dto.js";

export async function exchangeAuthCodeController(input: unknown) {
  return exchangeAuthCode(input);
}

export async function getAuthStatusController(input: unknown) {
  const request = validateMeegleAuthStatusRequest(input);

  // For now, always return require_auth_code since we don't have persistent token storage
  // In a production system, this would check the token store
  return {
    ok: true,
    data: {
      status: "require_auth_code" as const,
      operatorLarkId: request.operatorLarkId,
      baseUrl: request.baseUrl,
      reason: "No token store configured - extension should request auth code",
    },
  };
}

export async function refreshAuthCodeController(input: unknown) {
  return refreshAuthToken(input);
}
