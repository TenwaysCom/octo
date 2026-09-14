#!/bin/bash
#
# Octo 测试服务器重启服务脚本
# 用法: ./scripts/restart-staging-fe-n-server.sh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo '[1/4] 构建服务端...'
pnpm --dir server build

echo '[2/4] 重启 staging 服务端...'
pm2 restart octo-server-staging

echo '[3/4] 构建前端...'
make fe-build

echo '[4/4] 查看 Git 状态...'
git status
