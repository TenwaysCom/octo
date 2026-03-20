import { exchangeAuthCode, refreshAuthToken } from "./meegle-auth.service";

export async function meegleAuthExchangeController(input: unknown) {
  return exchangeAuthCode(input);
}

export async function meegleAuthRefreshController(input: unknown) {
  return refreshAuthToken(input);
}
