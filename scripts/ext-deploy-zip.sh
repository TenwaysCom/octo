#!/bin/bash
#
# Octo 扩展 zip 上传脚本
# 用法: ./scripts/ext-deploy-zip.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SSH_HOST="linyu@58.60.106.226"
SSH_PORT="2233"
REMOTE_DIR="/opt/project/static/octo"
EXT_DIR="${REPO_ROOT}/extension"

VERSION="$(node -p "require('${EXT_DIR}/package.json').version")"
ZIP_PATH="${EXT_DIR}/.output/tenways-octo-extension-${VERSION}-chrome.zip"
ZIP_BASENAME="$(basename "${ZIP_PATH}")"
LATEST_BASENAME="tenways-octo-extension-latest-chrome.zip"

echo "[EXT-DEPLOY-ZIP] 打包扩展 zip..."
pnpm --dir "${EXT_DIR}" package

if [ ! -f "${ZIP_PATH}" ]; then
  echo "[EXT-DEPLOY-ZIP] 未找到 zip: ${ZIP_PATH}" >&2
  exit 1
fi

echo "[EXT-DEPLOY-ZIP] 确保远程目录存在: ${REMOTE_DIR}"
ssh -p "${SSH_PORT}" "${SSH_HOST}" "mkdir -p '${REMOTE_DIR}'"

echo "[EXT-DEPLOY-ZIP] 上传 zip: ${ZIP_BASENAME}"
scp -P "${SSH_PORT}" "${ZIP_PATH}" "${SSH_HOST}:${REMOTE_DIR}/"

echo "[EXT-DEPLOY-ZIP] 更新 latest 别名: ${LATEST_BASENAME}"
ssh -p "${SSH_PORT}" "${SSH_HOST}" \
  "cp '${REMOTE_DIR}/${ZIP_BASENAME}' '${REMOTE_DIR}/${LATEST_BASENAME}'"

echo "[EXT-DEPLOY-ZIP] 上传完成:"
echo "  - ${REMOTE_DIR}/${ZIP_BASENAME}"
echo "  - ${REMOTE_DIR}/${LATEST_BASENAME}"
