import { logger } from "../../logger.js";

const versionLogger = logger.child({ module: "extension-version" });

export interface ExtensionVersionInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  forceUpdate: boolean;
  minVersion: string;
}

export async function getExtensionVersionController(_input: unknown) {
  const version = process.env.EXTENSION_LATEST_VERSION || "0.7.5";
  const downloadUrl = process.env.EXTENSION_DOWNLOAD_URL || "";
  const releaseNotes = process.env.EXTENSION_RELEASE_NOTES || "";
  const forceUpdate = process.env.EXTENSION_FORCE_UPDATE === "true";
  const minVersion = process.env.EXTENSION_MIN_VERSION || "0.0.0";

  versionLogger.debug({ version }, "Returning extension version info");

  return {
    ok: true,
    data: {
      version,
      downloadUrl,
      releaseNotes,
      forceUpdate,
      minVersion,
    },
  };
}
