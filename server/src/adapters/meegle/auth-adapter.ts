export interface UserTokenPair {
  userToken: string;
  refreshToken?: string;
}

export interface MeegleAuthAdapter {
  getPluginToken(baseUrl: string): Promise<string>;
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

function joinUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function extractToken(payload: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  throw new Error(`Missing token field: ${keys.join(", ")}`);
}

export function createHttpMeegleAuthAdapter(
  options: HttpMeegleAuthAdapterOptions,
): MeegleAuthAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async getPluginToken(baseUrl: string): Promise<string> {
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
        throw new Error(`Failed to get plugin token: ${response.status}`);
      }

      return extractToken(payload, ["plugin_access_token", "token", "access_token"]);
    },

    async exchangeUserToken(input): Promise<UserTokenPair> {
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
        throw new Error(`Failed to exchange user token: ${response.status}`);
      }

      return {
        userToken: extractToken(payload, ["user_access_token", "token", "access_token"]),
        refreshToken:
          typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
      };
    },

    async refreshUserToken(input): Promise<UserTokenPair> {
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
        throw new Error(`Failed to refresh user token: ${response.status}`);
      }

      return {
        userToken: extractToken(payload, ["user_access_token", "token", "access_token"]),
        refreshToken:
          typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
      };
    },
  };
}
