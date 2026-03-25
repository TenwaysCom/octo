/**
 * Extension Configuration
 *
 * Default values can be overridden via Chrome storage sync.
 * Use chrome.storage.sync.set({ MEEGLE_PLUGIN_ID: 'xxx' }) to configure.
 */

export interface ExtensionConfig {
  MEEGLE_PLUGIN_ID: string;
  LARK_APP_ID: string;
  SERVER_URL: string;
  MEEGLE_BASE_URL: string;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  MEEGLE_PLUGIN_ID: 'your-plugin-id', // TODO: Set via chrome.storage.sync.set
  LARK_APP_ID: 'cli_a4b5c6d7e8f9', // TODO: Set via chrome.storage.sync.set
  SERVER_URL: 'http://localhost:3000',
  MEEGLE_BASE_URL: 'https://project.larksuite.com',
};

let cachedConfig: ExtensionConfig | null = null;

export async function getConfig(): Promise<ExtensionConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_CONFIG, (result) => {
      cachedConfig = result as ExtensionConfig;
      resolve(cachedConfig);
    });
  });
}

export async function setConfig(updates: Partial<ExtensionConfig>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(updates, () => {
      // Update cache
      cachedConfig = { ...DEFAULT_CONFIG, ...cachedConfig, ...updates } as ExtensionConfig;
      resolve();
    });
  });
}

export function clearConfigCache(): void {
  cachedConfig = null;
}