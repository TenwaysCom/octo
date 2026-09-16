export interface ExtensionVersionInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  forceUpdate: boolean;
  minVersion: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  versionInfo: ExtensionVersionInfo | null;
}

export interface UpdateState {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  downloadUrl: string;
  forceUpdate: boolean;
  ignoredVersion: string | null;
  dismissedAt: string | null;
}
