/**
 * Test setup for Chrome extension API mocks
 */

// Mock chrome APIs
const mockStorage: Record<string, unknown> = {};

globalThis.chrome = {
  cookies: {
    get: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
  },
  storage: {
    sync: {
      get: vi.fn((defaults, callback) => {
        callback(defaults);
      }),
      set: vi.fn((data, callback) => {
        Object.assign(mockStorage, data);
        callback?.();
      }),
    },
    local: {
      get: vi.fn((keys, callback) => {
        callback?.({});
      }),
      set: vi.fn((data, callback) => {
        callback?.();
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    lastError: null,
    onMessage: {
      addListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    getManifest: vi.fn(() => ({ version: "0.7.1" })),
  },
  action: {
    setBadgeText: vi.fn((_details, callback?) => {
      callback?.();
      return Promise.resolve();
    }),
    setBadgeBackgroundColor: vi.fn((_details, callback?) => {
      callback?.();
      return Promise.resolve();
    }),
  },
  notifications: {
    create: vi.fn((_options, callback?) => {
      callback?.("notification-id");
      return Promise.resolve("notification-id");
    }),
  },
  downloads: {
    download: vi.fn((_options, callback?) => {
      callback?.(1);
      return Promise.resolve(1);
    }),
  },
  alarms: {
    create: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
} as unknown as typeof chrome;

// Mock fetch for API calls
globalThis.fetch = vi.fn();

export { mockStorage };
