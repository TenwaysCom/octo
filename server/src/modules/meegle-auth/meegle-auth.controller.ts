import { exchangeAuthCode, refreshAuthToken } from "./meegle-auth.service.js";

export async function exchangeAuthCodeController(input: unknown) {
  return exchangeAuthCode(input);
}

export async function getAuthStatusController(input: unknown) {
  // For now, just return a basic status
  // TODO: Implement proper status lookup
  return {
    ok: true,
    data: {
      tokenStatus: "require_auth_code" as const,
    },
  };
}

export async function refreshAuthCodeController(input: unknown) {
  return refreshAuthToken(input);
}
