import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearLogBuffer,
  createExtensionLogger,
  getLogBuffer,
  getLogLevel,
  setLogLevel,
} from "./logger.js";

describe("extension logger", () => {
  beforeEach(() => {
    clearLogBuffer();
    setLogLevel("info");
    vi.restoreAllMocks();
  });

  it("keeps debug entries in the export buffer even when console output is filtered", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = createExtensionLogger("test:logger");

    logger.debug("debug-buffer-entry", {
      reason: "diagnostic",
    });

    expect(debugSpy).not.toHaveBeenCalled();
    expect(getLogBuffer()).toEqual([
      expect.objectContaining({
        level: "debug",
        module: "test:logger",
        message: "debug-buffer-entry",
        detail: {
          reason: "diagnostic",
        },
      }),
    ]);
    expect(getLogLevel()).toBe("info");
  });
});
