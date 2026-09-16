export interface PluginTokenInfo {
  token: string;
  expiresInSeconds?: number;
}

export interface UserTokenPair {
  userToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  refreshTokenExpiresInSeconds?: number;
}

export interface MeegleAuthAdapter {
  getPluginToken(baseUrl: string): Promise<PluginTokenInfo>;
  exchangeUserToken(input: {
    baseUrl: string;
    pluginToken: string;
    authCode: string;
    state?: string;
  }): Promise<UserTokenPair>;
  refreshUserToken(input: {
    baseUrl: string;
    pluginToken: string;
    refreshToken: string;
  }): Promise<UserTokenPair>;
}

export interface HttpMeegleAuthAdapterOptions {
  pluginId: string;
  pluginSecret: string;
  fetchImpl?: typeof fetch;
}

interface JsonRecord {
  [key: string]: unknown;
}

async function parseJson(response: Response): Promise<JsonRecord> {
  const data = (await response.json()) as JsonRecord;
  return data;
}

function getNestedRecord(payload: JsonRecord, key: string): JsonRecord | undefined {
  const nested = payload[key];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as JsonRecord;
  }

  return undefined;
}

function getCandidatePayloads(payload: JsonRecord): JsonRecord[] {
  const nestedData = getNestedRecord(payload, "data");
  return nestedData ? [payload, nestedData] : [payload];
}

function extractOptionalString(payload: JsonRecord, keys: string[]): string | undefined {
  for (const candidate of getCandidatePayloads(payload)) {
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }

  return undefined;
}

function extractOptionalNumber(payload: JsonRecord, keys: string[]): number | undefined {
  for (const candidate of getCandidatePayloads(payload)) {
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
      }
      if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
  }

  return undefined;
}

function extractErrorMessage(payload: JsonRecord): string | undefined {
  const directMessageKeys = ["msg", "message", "error_message"];

  for (const key of directMessageKeys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  const errorPayload = payload.error;
  if (
    errorPayload &&
    typeof errorPayload === "object" &&
    !Array.isArray(errorPayload)
  ) {
    for (const key of directMessageKeys) {
      const value = (errorPayload as JsonRecord)[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }

  return undefined;
}

function joinUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function extractToken(payload: JsonRecord, keys: string[]): string {
  const token = extractOptionalString(payload, keys);
  if (token) {
    return token;
  }

  throw new Error(`Missing token field: ${keys.join(", ")}`);
}

import { logger } from "../../logger.js";

const adapterLogger = logger.child({ module: "meegle-auth-adapter" });

export function createHttpMeegleAuthAdapter(
  options: HttpMeegleAuthAdapterOptions,
): MeegleAuthAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async getPluginToken(baseUrl: string): Promise<PluginTokenInfo> {
      adapterLogger.info({ baseUrl }, "PLUGIN_TOKEN START");
      const response = await fetchImpl(joinUrl(baseUrl, "/bff/v2/authen/plugin_token"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plugin_id: options.pluginId,
          plugin_secret: options.pluginSecret,
        }),
      });
      const payload = await parseJson(response);

      if (!response.ok) {
        const detail = extractErrorMessage(payload);
        adapterLogger.error({ baseUrl, status: response.status, detail, payloadKeys: Object.keys(payload) }, "PLUGIN_TOKEN FAIL");
        throw new Error(
          `Failed to get plugin token: ${response.status}${detail ? ` ${detail}` : ""}`,
        );
      }

      const token = extractToken(payload, ["plugin_access_token", "token", "access_token"]);
      const expiresInSeconds = extractOptionalNumber(payload, ["expire_time", "expires_in", "expiresIn"]);
      adapterLogger.info({ baseUrl, hasToken: Boolean(token), expiresInSeconds }, "PLUGIN_TOKEN OK");
      return {
        token,
        expiresInSeconds,
      };
    },

    async exchangeUserToken(input): Promise<UserTokenPair> {
      adapterLogger.info({ baseUrl: input.baseUrl, hasPluginToken: Boolean(input.pluginToken), authCodeSuffix: input.authCode.slice(-6) }, "USER_PLUGIN_TOKEN START");
      const response = await fetchImpl(
        joinUrl(input.baseUrl, "/bff/v2/authen/user_plugin_token"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Plugin-Token": input.pluginToken,
          },
          body: JSON.stringify({
            code: input.authCode,
            grant_type: "authorization_code",
          }),
        },
      );
      const payload = await parseJson(response);

      if (!response.ok) {
        const detail = extractErrorMessage(payload);
        adapterLogger.error({ baseUrl: input.baseUrl, status: response.status, detail, payloadKeys: Object.keys(payload) }, "USER_PLUGIN_TOKEN FAIL");
        throw new Error(
          `Failed to exchange user token: ${response.status}${detail ? ` ${detail}` : ""}`,
        );
      }

      const userToken = extractToken(payload, ["user_access_token", "token", "access_token"]);
      const refreshToken = extractOptionalString(payload, ["refresh_token"]);
      const expiresInSeconds = extractOptionalNumber(payload, ["expire_time", "expires_in", "expiresIn"]);
      const refreshTokenExpiresInSeconds = extractOptionalNumber(payload, [
        "refresh_token_expire_time",
        "refresh_token_expires_in",
        "refresh_expires_in",
      ]);
      adapterLogger.info({ baseUrl: input.baseUrl, hasUserToken: Boolean(userToken), hasRefreshToken: Boolean(refreshToken), expiresInSeconds, refreshTokenExpiresInSeconds }, "USER_PLUGIN_TOKEN OK");
      return {
        userToken,
        refreshToken,
        expiresInSeconds,
        refreshTokenExpiresInSeconds,
      };
    },

    async refreshUserToken(input): Promise<UserTokenPair> {
      adapterLogger.info({ baseUrl: input.baseUrl, hasPluginToken: Boolean(input.pluginToken), hasRefreshToken: Boolean(input.refreshToken) }, "REFRESH_TOKEN START");
      const response = await fetchImpl(
        joinUrl(input.baseUrl, "/bff/v2/authen/refresh_token"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Plugin-Token": input.pluginToken,
          },
          body: JSON.stringify({
            refresh_token: input.refreshToken,
            type: 1,
          }),
        },
      );
      const payload = await parseJson(response);

      if (!response.ok) {
        const detail = extractErrorMessage(payload);
        adapterLogger.error({ baseUrl: input.baseUrl, status: response.status, detail, payloadKeys: Object.keys(payload) }, "REFRESH_TOKEN FAIL");
        throw new Error(
          `Failed to refresh user token: ${response.status}${detail ? ` ${detail}` : ""}`,
        );
      }

      const userToken = extractToken(payload, ["user_access_token", "token", "access_token"]);
      const refreshToken = extractOptionalString(payload, ["refresh_token"]);
      const expiresInSeconds = extractOptionalNumber(payload, ["expire_time", "expires_in", "expiresIn"]);
      const refreshTokenExpiresInSeconds = extractOptionalNumber(payload, [
        "refresh_token_expire_time",
        "refresh_token_expires_in",
        "refresh_expires_in",
      ]);
      adapterLogger.info({ baseUrl: input.baseUrl, hasUserToken: Boolean(userToken), hasRefreshToken: Boolean(refreshToken), expiresInSeconds, refreshTokenExpiresInSeconds }, "REFRESH_TOKEN OK");
      return {
        userToken,
        refreshToken,
        expiresInSeconds,
        refreshTokenExpiresInSeconds,
      };
    },
  };
}
