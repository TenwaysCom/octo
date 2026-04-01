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
  },
} as unknown as typeof chrome;

// Mock fetch for API calls
globalThis.fetch = vi.fn();

export { mockStorage };
