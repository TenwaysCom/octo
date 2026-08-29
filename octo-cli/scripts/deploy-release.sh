#!/usr/bin/env bash
# Build and publish an octo-cli release to a private HTTPS static host.
# Required: OCTO_CLI_RELEASE_BASE_URL, OCTO_CLI_RELEASE_HOST, OCTO_CLI_RELEASE_DIR
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cli_root="${repo_root}/octo-cli"
echo "[OCTO-CLI-RELEASE] Build, test, package, and create manifest..."
pnpm --dir "${cli_root}" run release:prepare -- --base-url "${OCTO_CLI_RELEASE_BASE_URL}"
bash "${cli_root}/scripts/publish-release.sh" --artifacts-dir "${cli_root}/release"
