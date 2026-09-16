import {
  buildLarkOAuthCallbackContentMatches,
  buildOctoWebContentMatches,
  isOctoWebOriginAllowed,
  OCTO_SERVER_URLS,
  parseOctoWebAllowedOrigins,
} from "./environment-config.js";

export const OCTO_WEB_ALLOWED_ORIGINS = parseOctoWebAllowedOrigins(
  import.meta.env.WXT_PUBLIC_OCTO_WEB_ALLOWED_ORIGINS,
);

export const OCTO_WEB_CONTENT_MATCHES = buildOctoWebContentMatches([
  ...Object.values(OCTO_SERVER_URLS),
  ...OCTO_WEB_ALLOWED_ORIGINS,
]);

export const LARK_OAUTH_CALLBACK_CONTENT_MATCHES = buildLarkOAuthCallbackContentMatches([
  ...Object.values(OCTO_SERVER_URLS),
  ...OCTO_WEB_ALLOWED_ORIGINS,
]);

export function isConfiguredOctoWebOriginAllowed(input: {
  pageOrigin: string;
  serverUrl: string;
}): boolean {
  return isOctoWebOriginAllowed({
    ...input,
    additionalAllowedOrigins: OCTO_WEB_ALLOWED_ORIGINS,
  });
}
