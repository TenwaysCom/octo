import { getExtensionVersionController } from "./extension-version.controller.js";

describe("getExtensionVersionController", () => {
  const originalLatestVersion = process.env.EXTENSION_LATEST_VERSION;

  afterEach(() => {
    if (originalLatestVersion === undefined) {
      delete process.env.EXTENSION_LATEST_VERSION;
    } else {
      process.env.EXTENSION_LATEST_VERSION = originalLatestVersion;
    }
  });

  it("returns the configured EXTENSION_LATEST_VERSION", async () => {
    process.env.EXTENSION_LATEST_VERSION = "9.8.7";

    const result = await getExtensionVersionController(undefined);

    expect(result.data.version).toBe("9.8.7");
  });

  it("falls back to 0.8.1 when EXTENSION_LATEST_VERSION is unset", async () => {
    delete process.env.EXTENSION_LATEST_VERSION;

    const result = await getExtensionVersionController(undefined);

    expect(result.data.version).toBe("0.8.1");
  });
});
