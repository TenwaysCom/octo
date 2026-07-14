import { getExtensionVersionController } from "./extension-version.controller.js";
import { SERVER_VERSION } from "../../server-version.js";

describe("getExtensionVersionController", () => {
  it("returns the packaged server version", async () => {
    const result = await getExtensionVersionController(undefined);

    expect(result.data.version).toBe(SERVER_VERSION);
  });

  it("does not use the legacy environment variable", async () => {
    const originalLatestVersion = process.env.EXTENSION_LATEST_VERSION;
    process.env.EXTENSION_LATEST_VERSION = "9.8.7";

    try {
      const result = await getExtensionVersionController(undefined);

      expect(result.data.version).toBe(SERVER_VERSION);
    } finally {
      if (originalLatestVersion === undefined) {
        delete process.env.EXTENSION_LATEST_VERSION;
      } else {
        process.env.EXTENSION_LATEST_VERSION = originalLatestVersion;
      }
    }
  });
});
