export const DEFAULT_MEEGLE_AUTH_BASE_URL = "https://project.larksuite.com";
export const DEFAULT_LARK_AUTH_BASE_URL = "https://open.larksuite.com";

export function normalizeMeegleAuthBaseUrl(
  _input?: string | null,
  canonicalBaseUrl = DEFAULT_MEEGLE_AUTH_BASE_URL,
): string {
  return canonicalBaseUrl;
}

export function normalizeLarkAuthBaseUrl(
  _input?: string | null,
  canonicalBaseUrl = DEFAULT_LARK_AUTH_BASE_URL,
): string {
  return canonicalBaseUrl;
}
