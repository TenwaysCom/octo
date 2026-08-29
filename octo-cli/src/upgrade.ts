import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

export const OCTO_CLI_PACKAGE_NAME = "@tenways/octo-cli";

const execFile = promisify(execFileCallback);

export interface OctoCliReleaseManifest {
  schemaVersion: 1;
  package: typeof OCTO_CLI_PACKAGE_NAME;
  version: string;
  publishedAt: string;
  artifact: {
    url: string;
    sha256: string;
    size: number;
  };
}

export interface UpgradeCheck {
  currentVersion: string;
  updateAvailable: boolean;
  manifestUrl: string;
  release: OctoCliReleaseManifest;
}

export interface UpgradeDependencies {
  fetchImpl?: typeof fetch;
  currentVersion?: string;
  updateToken?: string;
  execute?: (file: string, args: readonly string[]) => Promise<void>;
}

export async function checkForUpgrade(
  manifestUrl: string,
  dependencies: UpgradeDependencies = {},
): Promise<UpgradeCheck> {
  const normalizedManifestUrl = normalizeReleaseUrl(manifestUrl, "Update manifest URL");
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const response = await fetchImpl(normalizedManifestUrl, {
    headers: requestHeaders({ accept: "application/json" }, dependencies.updateToken),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`UPGRADE_MANIFEST_REQUEST_FAILED: ${response.status} ${response.statusText}`.trim());
  const manifest = parseReleaseManifest(await response.json());
  const currentVersion = dependencies.currentVersion ?? await readInstalledVersion();
  return {
    currentVersion,
    updateAvailable: compareVersions(manifest.version, currentVersion) > 0,
    manifestUrl: normalizedManifestUrl,
    release: manifest,
  };
}

export async function applyUpgrade(
  check: UpgradeCheck,
  dependencies: UpgradeDependencies = {},
): Promise<{ updated: boolean; version: string }> {
  if (!check.updateAvailable) return { updated: false, version: check.currentVersion };

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const response = await fetchImpl(check.release.artifact.url, {
    headers: requestHeaders(undefined, dependencies.updateToken),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`UPGRADE_ARTIFACT_REQUEST_FAILED: ${response.status} ${response.statusText}`.trim());
  const artifact = Buffer.from(await response.arrayBuffer());
  if (artifact.length !== check.release.artifact.size) {
    throw new Error("UPGRADE_ARTIFACT_SIZE_MISMATCH: downloaded artifact size does not match the release manifest.");
  }
  const sha256 = createHash("sha256").update(artifact).digest("hex");
  if (sha256 !== check.release.artifact.sha256) {
    throw new Error("UPGRADE_ARTIFACT_HASH_MISMATCH: downloaded artifact SHA-256 does not match the release manifest.");
  }

  const directory = await mkdtemp(join(tmpdir(), "octo-cli-upgrade-"));
  const artifactPath = join(directory, sanitizeArtifactName(check.release.artifact.url));
  try {
    await writeFile(artifactPath, artifact, { mode: 0o600 });
    const execute = dependencies.execute ?? defaultExecute;
    await execute("npm", ["install", "--global", "--ignore-scripts", artifactPath]);
    return { updated: true, version: check.release.version };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function resolveManifestUrl(
  flagValue: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = flagValue?.trim() || environment.OCTO_CLI_UPDATE_URL?.trim();
  if (!value) {
    throw new Error("UPGRADE_MANIFEST_URL_REQUIRED: provide --manifest-url <https-url> or set OCTO_CLI_UPDATE_URL.");
  }
  return normalizeReleaseUrl(value, "Update manifest URL");
}

export function resolveUpdateToken(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = environment.OCTO_CLI_UPDATE_TOKEN?.trim();
  return value || undefined;
}

export function parseReleaseManifest(value: unknown): OctoCliReleaseManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("UPGRADE_MANIFEST_INVALID: manifest must be a JSON object.");
  }
  const manifest = value as Record<string, unknown>;
  const artifact = manifest.artifact;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error("UPGRADE_MANIFEST_INVALID: manifest artifact is required.");
  }
  const artifactValue = artifact as Record<string, unknown>;
  if (manifest.schemaVersion !== 1 || manifest.package !== OCTO_CLI_PACKAGE_NAME) {
    throw new Error("UPGRADE_MANIFEST_INVALID: unsupported release manifest.");
  }
  if (typeof manifest.version !== "string" || !isReleaseVersion(manifest.version)) {
    throw new Error("UPGRADE_MANIFEST_INVALID: manifest version must be a stable semantic version.");
  }
  if (typeof manifest.publishedAt !== "string" || Number.isNaN(Date.parse(manifest.publishedAt))) {
    throw new Error("UPGRADE_MANIFEST_INVALID: manifest publishedAt must be an ISO date.");
  }
  if (typeof artifactValue.url !== "string" || typeof artifactValue.sha256 !== "string" || typeof artifactValue.size !== "number") {
    throw new Error("UPGRADE_MANIFEST_INVALID: manifest artifact fields are invalid.");
  }
  const url = normalizeReleaseUrl(artifactValue.url, "Release artifact URL");
  const sha256 = artifactValue.sha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(artifactValue.size) || artifactValue.size <= 0) {
    throw new Error("UPGRADE_MANIFEST_INVALID: manifest artifact checksum or size is invalid.");
  }
  return {
    schemaVersion: 1,
    package: OCTO_CLI_PACKAGE_NAME,
    version: manifest.version,
    publishedAt: manifest.publishedAt,
    artifact: { url, sha256, size: artifactValue.size },
  };
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function parseVersion(version: string): number[] {
  if (!isReleaseVersion(version)) throw new Error(`UPGRADE_VERSION_INVALID: ${version} is not a stable semantic version.`);
  return version.split(".").map(Number);
}

function isReleaseVersion(value: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

function normalizeReleaseUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${label} must be an absolute HTTPS URL without credentials or a fragment.`);
  }
  return url.toString();
}

function sanitizeArtifactName(url: string): string {
  const filename = basename(new URL(url).pathname);
  return filename.endsWith(".tgz") && /^[a-zA-Z0-9._@-]+$/.test(filename) ? filename : "octo-cli-release.tgz";
}

function requestHeaders(base: Record<string, string> | undefined, updateToken: string | undefined): Headers {
  const headers = new Headers(base);
  if (updateToken) headers.set("authorization", `Bearer ${updateToken}`);
  return headers;
}

async function readInstalledVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || !isReleaseVersion(packageJson.version)) {
    throw new Error("UPGRADE_VERSION_INVALID: installed package version must be a stable semantic version.");
  }
  return packageJson.version;
}

async function defaultExecute(file: string, args: readonly string[]): Promise<void> {
  await execFile(file, [...args], { windowsHide: true });
}
