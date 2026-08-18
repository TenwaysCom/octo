/**
 * Extension Configuration
 *
 * Default values can be overridden via Chrome storage sync.
 * Use chrome.storage.sync.set({ MEEGLE_PLUGIN_ID: 'xxx' }) to configure.
 */

import { fetchServerJson } from "../server-request.js";
import { OCTO_SERVER_URLS, type OctoEnvironmentName } from "../environment-config.js";

export interface ExtensionConfig {
  ENV_NAME: "prod" | "test" | "dev";
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

interface StoredExtensionConfig extends Partial<ExtensionConfig> {
  PUBLIC_CONFIG_SOURCE_SERVER_ORIGIN?: string;
}

export const SERVER_URLS = OCTO_SERVER_URLS;

export type EnvironmentName = OctoEnvironmentName;

const LARK_OAUTH_CALLBACK_PATH = "/api/lark/auth/callback";

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
  return value === "prod" || value === "test" || value === "dev";
}

function isDefaultServerUrl(value: string): boolean {
  return Object.values(SERVER_URLS).includes(value as (typeof SERVER_URLS)[EnvironmentName]);
}

function getServerOrigin(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function isLarkOAuthCallbackCompatibleWithServer(input: {
  serverUrl: string;
  callbackUrl: string;
}): boolean {
  try {
    const serverUrl = new URL(input.serverUrl);
    const callbackUrl = new URL(input.callbackUrl);
    return (
      callbackUrl.origin === serverUrl.origin
      && callbackUrl.pathname === LARK_OAUTH_CALLBACK_PATH
      && callbackUrl.search === ""
      && callbackUrl.hash === ""
    );
  } catch {
    return false;
  }
}

export function resolveServerUrl(input: {
  envName?: unknown;
  serverUrl?: unknown;
}): string {
  if (typeof input.serverUrl === "string" && input.serverUrl.trim()) {
    const serverUrl = input.serverUrl.trim();
    if (!isEnvironmentName(input.envName) || !isDefaultServerUrl(serverUrl)) {
      return serverUrl;
    }
  }

  if (isEnvironmentName(input.envName)) {
    return SERVER_URLS[input.envName];
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
  const storedValues = await new Promise<StoredExtensionConfig>((resolve) => {
    chrome.storage.sync.get(null, (result) => {
      resolve((result ?? {}) as StoredExtensionConfig);
    });
  });
  const resolvedServerUrl = resolveServerUrl({
    envName: storedValues.ENV_NAME,
    serverUrl: storedValues.SERVER_URL,
  });
  const resolvedServerOrigin = getServerOrigin(resolvedServerUrl);
  const storedPublicConfigMatchesServer = storedValues.PUBLIC_CONFIG_SOURCE_SERVER_ORIGIN
    ? storedValues.PUBLIC_CONFIG_SOURCE_SERVER_ORIGIN === resolvedServerOrigin
    : isLarkOAuthCallbackCompatibleWithServer({
        serverUrl: resolvedServerUrl,
        callbackUrl: storedValues.LARK_OAUTH_CALLBACK_URL ?? "",
      });
  const {
    PUBLIC_CONFIG_SOURCE_SERVER_ORIGIN: _storedPublicConfigSourceServerOrigin,
    ...storedExtensionConfig
  } = storedValues;
  const resolvedStoredConfig: ExtensionConfig = {
    ...DEFAULT_CONFIG,
    ...storedExtensionConfig,
    ...(!storedPublicConfigMatchesServer
      ? {
          MEEGLE_PLUGIN_ID: "",
          LARK_APP_ID: "",
          LARK_OAUTH_CALLBACK_URL: "",
          LARK_OAUTH_SCOPE: DEFAULT_CONFIG.LARK_OAUTH_SCOPE,
          CLIENT_DEBUG_LOG_UPLOAD_ENABLED: false,
          MEEGLE_BASE_URL: DEFAULT_CONFIG.MEEGLE_BASE_URL,
        }
      : {}),
    ENV_NAME: isEnvironmentName(storedValues.ENV_NAME) ? storedValues.ENV_NAME : DEFAULT_CONFIG.ENV_NAME,
    SERVER_URL: resolvedServerUrl,
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
    if (
      !mergedConfig.LARK_APP_ID
      || !isLarkOAuthCallbackCompatibleWithServer({
        serverUrl: mergedConfig.SERVER_URL,
        callbackUrl: mergedConfig.LARK_OAUTH_CALLBACK_URL,
      })
    ) {
      return resolvedStoredConfig;
    }
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
      PUBLIC_CONFIG_SOURCE_SERVER_ORIGIN: resolvedServerOrigin,
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
