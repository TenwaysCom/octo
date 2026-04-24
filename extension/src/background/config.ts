/**
 * Extension Configuration
 *
 * Default values can be overridden via Chrome storage sync.
 * Use chrome.storage.sync.set({ MEEGLE_PLUGIN_ID: 'xxx' }) to configure.
 */

import { fetchServerJson } from "../server-request.js";

export interface ExtensionConfig {
  ENV_NAME: "prod" | "test";
  MEEGLE_PLUGIN_ID: string;
  LARK_APP_ID: string;
  LARK_OAUTH_CALLBACK_URL: string;
  LARK_OAUTH_SCOPE: string;
  CLIENT_DEBUG_LOG_UPLOAD_ENABLED: boolean;
  SERVER_URL: string;
  MEEGLE_BASE_URL: string;
}

interface PublicConfigResponse {
  ok: boolean;
  data?: Partial<Pick<ExtensionConfig, "MEEGLE_PLUGIN_ID" | "LARK_APP_ID" | "LARK_OAUTH_CALLBACK_URL" | "MEEGLE_BASE_URL" | "LARK_OAUTH_SCOPE" | "CLIENT_DEBUG_LOG_UPLOAD_ENABLED">>;
}

export const SERVER_URLS = {
  prod: "https://octo.odoo.tenways.it:18443",
  test: "https://octotest.odoo.tenways.it:18443",
} as const;

export type EnvironmentName = keyof typeof SERVER_URLS;

export const DEFAULT_CONFIG: ExtensionConfig = {
  ENV_NAME: "prod",
  MEEGLE_PLUGIN_ID: '',
  LARK_APP_ID: 'cli_a4b5c6d7e8f9', // TODO: Set via chrome.storage.sync.set
  LARK_OAUTH_CALLBACK_URL: 'http://localhost:3000/api/lark/auth/callback',
  LARK_OAUTH_SCOPE: 'offline_access contact:user.base:readonly bitable:app base:record:retrieve im:message.send_as_user im:message.reactions:write_only im:chat:readonly im:message',
  CLIENT_DEBUG_LOG_UPLOAD_ENABLED: false,
  SERVER_URL: SERVER_URLS.prod,
  MEEGLE_BASE_URL: 'https://project.larksuite.com',
};

export function isEnvironmentName(value: unknown): value is EnvironmentName {
  return value === "prod" || value === "test";
}

export function resolveServerUrl(input: {
  envName?: unknown;
  serverUrl?: unknown;
}): string {
  if (isEnvironmentName(input.envName)) {
    return SERVER_URLS[input.envName];
  }

  if (typeof input.serverUrl === "string" && input.serverUrl.trim()) {
    return input.serverUrl.trim();
  }

  return SERVER_URLS.prod;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function mergePublicConfig(
  base: ExtensionConfig,
  publicConfig?: PublicConfigResponse["data"],
): ExtensionConfig {
  if (!publicConfig) {
    return base;
  }

  return {
    ...base,
    MEEGLE_PLUGIN_ID: publicConfig.MEEGLE_PLUGIN_ID?.trim() || base.MEEGLE_PLUGIN_ID,
    LARK_APP_ID: publicConfig.LARK_APP_ID?.trim() || base.LARK_APP_ID,
    LARK_OAUTH_CALLBACK_URL:
      publicConfig.LARK_OAUTH_CALLBACK_URL?.trim() || base.LARK_OAUTH_CALLBACK_URL,
    LARK_OAUTH_SCOPE: publicConfig.LARK_OAUTH_SCOPE?.trim() || base.LARK_OAUTH_SCOPE,
    CLIENT_DEBUG_LOG_UPLOAD_ENABLED:
      typeof publicConfig.CLIENT_DEBUG_LOG_UPLOAD_ENABLED === "boolean"
        ? publicConfig.CLIENT_DEBUG_LOG_UPLOAD_ENABLED
        : base.CLIENT_DEBUG_LOG_UPLOAD_ENABLED,
    MEEGLE_BASE_URL: publicConfig.MEEGLE_BASE_URL?.trim() || base.MEEGLE_BASE_URL,
  };
}

export async function getConfig(): Promise<ExtensionConfig> {
  const storedValues = await new Promise<Partial<ExtensionConfig>>((resolve) => {
    chrome.storage.sync.get(null, (result) => {
      resolve((result ?? {}) as Partial<ExtensionConfig>);
    });
  });
  const resolvedStoredConfig: ExtensionConfig = {
    ...DEFAULT_CONFIG,
    ...storedValues,
    ENV_NAME: isEnvironmentName(storedValues.ENV_NAME) ? storedValues.ENV_NAME : DEFAULT_CONFIG.ENV_NAME,
    SERVER_URL: resolveServerUrl({
      envName: storedValues.ENV_NAME,
      serverUrl: storedValues.SERVER_URL,
    }),
  };

  try {
    const { response, payload } = await fetchServerJson<PublicConfigResponse>({
      url: `${resolvedStoredConfig.SERVER_URL}/api/config/public`,
      method: "GET",
    });
    if (!response.ok) {
      return resolvedStoredConfig;
    }

    if (!payload.ok) {
      return resolvedStoredConfig;
    }

    const mergedConfig = mergePublicConfig(resolvedStoredConfig, payload.data);
    const publicConfigUpdates = {
      MEEGLE_PLUGIN_ID: trimOrUndefined(payload.data?.MEEGLE_PLUGIN_ID),
      LARK_APP_ID: trimOrUndefined(payload.data?.LARK_APP_ID),
      LARK_OAUTH_CALLBACK_URL: trimOrUndefined(payload.data?.LARK_OAUTH_CALLBACK_URL),
      LARK_OAUTH_SCOPE: trimOrUndefined(payload.data?.LARK_OAUTH_SCOPE),
      CLIENT_DEBUG_LOG_UPLOAD_ENABLED:
        typeof payload.data?.CLIENT_DEBUG_LOG_UPLOAD_ENABLED === "boolean"
          ? payload.data.CLIENT_DEBUG_LOG_UPLOAD_ENABLED
          : undefined,
      MEEGLE_BASE_URL: trimOrUndefined(payload.data?.MEEGLE_BASE_URL),
    };

    if (
      publicConfigUpdates.MEEGLE_PLUGIN_ID ||
      publicConfigUpdates.LARK_APP_ID ||
      publicConfigUpdates.LARK_OAUTH_CALLBACK_URL ||
      publicConfigUpdates.LARK_OAUTH_SCOPE ||
      typeof publicConfigUpdates.CLIENT_DEBUG_LOG_UPLOAD_ENABLED === "boolean" ||
      publicConfigUpdates.MEEGLE_BASE_URL
    ) {
      await setConfig(publicConfigUpdates);
    }

    return mergedConfig;
  } catch {
    return resolvedStoredConfig;
  }
}

export async function setConfig(updates: Partial<ExtensionConfig>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(updates, () => {
      resolve();
    });
  });
}

export function clearConfigCache(): void {
  // No-op: config is read fresh from chrome.storage.sync each time.
}
