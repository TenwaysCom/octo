/**
 * Extension Configuration
 *
 * Default values can be overridden via Chrome storage sync.
 * Use chrome.storage.sync.set({ MEEGLE_PLUGIN_ID: 'xxx' }) to configure.
 */

export interface ExtensionConfig {
  MEEGLE_PLUGIN_ID: string;
  LARK_APP_ID: string;
  LARK_OAUTH_CALLBACK_URL: string;
  SERVER_URL: string;
  MEEGLE_BASE_URL: string;
}

interface PublicConfigResponse {
  ok: boolean;
  data?: Partial<Pick<ExtensionConfig, "MEEGLE_PLUGIN_ID" | "LARK_APP_ID" | "LARK_OAUTH_CALLBACK_URL" | "MEEGLE_BASE_URL">>;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  MEEGLE_PLUGIN_ID: '',
  LARK_APP_ID: 'cli_a4b5c6d7e8f9', // TODO: Set via chrome.storage.sync.set
  LARK_OAUTH_CALLBACK_URL: 'http://localhost:3000/api/lark/auth/callback',
  SERVER_URL: 'http://localhost:3000',
  MEEGLE_BASE_URL: 'https://project.larksuite.com',
};

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
    MEEGLE_BASE_URL: publicConfig.MEEGLE_BASE_URL?.trim() || base.MEEGLE_BASE_URL,
  };
}

export async function getConfig(): Promise<ExtensionConfig> {
  const storedConfig = await new Promise<ExtensionConfig>((resolve) => {
    chrome.storage.sync.get(DEFAULT_CONFIG, (result) => {
      resolve(result as ExtensionConfig);
    });
  });

  try {
    const response = await fetch(`${storedConfig.SERVER_URL}/api/config/public`);
    if (!response.ok) {
      return storedConfig;
    }

    const payload = await response.json() as PublicConfigResponse;
    if (!payload.ok) {
      return storedConfig;
    }

    const mergedConfig = mergePublicConfig(storedConfig, payload.data);
    const publicConfigUpdates = {
      MEEGLE_PLUGIN_ID: trimOrUndefined(payload.data?.MEEGLE_PLUGIN_ID),
      LARK_APP_ID: trimOrUndefined(payload.data?.LARK_APP_ID),
      LARK_OAUTH_CALLBACK_URL: trimOrUndefined(payload.data?.LARK_OAUTH_CALLBACK_URL),
      MEEGLE_BASE_URL: trimOrUndefined(payload.data?.MEEGLE_BASE_URL),
    };

    if (
      publicConfigUpdates.MEEGLE_PLUGIN_ID ||
      publicConfigUpdates.LARK_APP_ID ||
      publicConfigUpdates.LARK_OAUTH_CALLBACK_URL ||
      publicConfigUpdates.MEEGLE_BASE_URL
    ) {
      await setConfig(publicConfigUpdates);
    }

    return mergedConfig;
  } catch {
    return storedConfig;
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
