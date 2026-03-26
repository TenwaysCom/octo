import {
  checkAuthStatus,
  exchangeAuthCode,
  refreshAuthToken,
} from "./meegle-auth.service.js";
import { validateMeegleAuthStatusRequest } from "./meegle-auth.dto.js";

export async function exchangeAuthCodeController(input: unknown) {
  return exchangeAuthCode(input);
}

export async function getAuthStatusController(input: unknown) {
  validateMeegleAuthStatusRequest(input);
  return checkAuthStatus(input);
}

export async function refreshAuthCodeController(input: unknown) {
  return refreshAuthToken(input);
}
