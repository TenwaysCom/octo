#!/usr/bin/env bash
# Upload a pre-built octo-cli release artifact to a private HTTPS static host.
# Required: OCTO_CLI_RELEASE_BASE_URL, OCTO_CLI_RELEASE_HOST, OCTO_CLI_RELEASE_DIR
set -euo pipefail

for required_name in OCTO_CLI_RELEASE_BASE_URL OCTO_CLI_RELEASE_HOST OCTO_CLI_RELEASE_DIR; do
  if [[ -z "${!required_name:-}" ]]; then
    echo "[OCTO-CLI-RELEASE] ${required_name} is required." >&2
    exit 1
  fi
done

release_port="${OCTO_CLI_RELEASE_PORT:-22}"
if [[ ! "${OCTO_CLI_RELEASE_HOST}" =~ ^[A-Za-z0-9._@-]+$ ]]; then
  echo "[OCTO-CLI-RELEASE] OCTO_CLI_RELEASE_HOST contains unsupported characters." >&2
  exit 1
fi
if [[ ! "${release_port}" =~ ^[0-9]{1,5}$ ]] || (( release_port < 1 || release_port > 65535 )); then
  echo "[OCTO-CLI-RELEASE] OCTO_CLI_RELEASE_PORT must be between 1 and 65535." >&2
  exit 1
fi
if [[ ! "${OCTO_CLI_RELEASE_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "[OCTO-CLI-RELEASE] OCTO_CLI_RELEASE_DIR must be an absolute safe path." >&2
  exit 1
fi

artifacts_dir=""
while (( $# > 0 )); do
  case "$1" in
    --artifacts-dir)
      artifacts_dir="${2:-}"
      shift 2
      ;;
    *)
      echo "[OCTO-CLI-RELEASE] Expected --artifacts-dir <directory>." >&2
      exit 1
      ;;
  esac
done
if [[ -z "${artifacts_dir}" || ! -d "${artifacts_dir}" ]]; then
  echo "[OCTO-CLI-RELEASE] A readable --artifacts-dir is required." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cli_root="${repo_root}/octo-cli"
version="$(node -p "require('${cli_root}/package.json').version")"
tarball="${artifacts_dir}/octo-cli-${version}.tgz"
manifest="${artifacts_dir}/latest.json"
if [[ ! -f "${tarball}" || ! -f "${manifest}" ]]; then
  echo "[OCTO-CLI-RELEASE] Expected ${tarball} and ${manifest}." >&2
  exit 1
fi

node - "${manifest}" "${version}" "${tarball}" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const [manifestPath, version, tarballPath] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tarball = readFileSync(tarballPath);
const actualHash = createHash("sha256").update(tarball).digest("hex");
if (manifest.schemaVersion !== 1 || manifest.package !== "@tenways/octo-cli" || manifest.version !== version || manifest.artifact?.sha256 !== actualHash || manifest.artifact?.size !== tarball.length) {
  throw new Error("Release artifact does not match its manifest.");
}
NODE

echo "[OCTO-CLI-RELEASE] Check that the remote release is not being overwritten..."
ssh -p "${release_port}" "${OCTO_CLI_RELEASE_HOST}" "test -f '${OCTO_CLI_RELEASE_DIR}/latest.json' && cat '${OCTO_CLI_RELEASE_DIR}/latest.json' || true" | node - "${version}" <<'NODE'
let body = "";
const version = process.argv[2];
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { body += chunk; });
process.stdin.on("end", () => {
  if (!body.trim()) return;
  const existing = JSON.parse(body);
  const parse = (value) => String(value).split(".").map(Number);
  const [nextMajor, nextMinor, nextPatch] = parse(version);
  const [currentMajor, currentMinor, currentPatch] = parse(existing.version);
  if (![nextMajor, nextMinor, nextPatch, currentMajor, currentMinor, currentPatch].every(Number.isSafeInteger)) {
    throw new Error("Remote release manifest has an invalid version.");
  }
  if (currentMajor > nextMajor || (currentMajor === nextMajor && currentMinor > nextMinor) || (currentMajor === nextMajor && currentMinor === nextMinor && currentPatch >= nextPatch)) {
    throw new Error(`Remote release ${existing.version} is not older than ${version}; publish a new version instead.`);
  }
});
NODE

echo "[OCTO-CLI-RELEASE] Create remote directory..."
ssh -p "${release_port}" "${OCTO_CLI_RELEASE_HOST}" "mkdir -p -- '${OCTO_CLI_RELEASE_DIR}'"

echo "[OCTO-CLI-RELEASE] Upload verified tarball and manifest..."
scp -P "${release_port}" "${tarball}" "${manifest}" "${OCTO_CLI_RELEASE_HOST}:${OCTO_CLI_RELEASE_DIR}/"

echo "[OCTO-CLI-RELEASE] Verify published manifest over HTTPS..."
verify_headers=()
if [[ -n "${OCTO_CLI_RELEASE_VERIFY_TOKEN:-}" ]]; then
  verify_headers=(-H "Authorization: Bearer ${OCTO_CLI_RELEASE_VERIFY_TOKEN}")
fi
curl --fail --silent --show-error "${verify_headers[@]}" "${OCTO_CLI_RELEASE_BASE_URL%/}/latest.json" | node - "${version}" <<'NODE'
let body = "";
const expectedVersion = process.argv[2];
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { body += chunk; });
process.stdin.on("end", () => {
  const manifest = JSON.parse(body);
  if (manifest.schemaVersion !== 1 || manifest.package !== "@tenways/octo-cli" || manifest.version !== expectedVersion || !manifest.artifact?.sha256) process.exit(1);
  process.stdout.write(`${JSON.stringify({ version: manifest.version, artifact: manifest.artifact.url })}\n`);
});
NODE

echo "[OCTO-CLI-RELEASE] Private release published successfully."
