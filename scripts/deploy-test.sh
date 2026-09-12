#!/bin/bash
#
# Octo 测试服务器部署脚本
# 完整流程：git pull + 安装依赖 + 构建服务端
# 用法: ./scripts/deploy-test.sh

set -e

# 服务器配置
SSH_HOST="deploy@58.60.106.226"
SSH_PORT="2233"
PROJECT_DIR="~/projects/octo_test"

echo "[DEPLOY-TEST] 连接到测试服务器执行部署..."

ssh -p "$SSH_PORT" "$SSH_HOST" -t "
    set -e
    cd $PROJECT_DIR

    echo '[1/3] 拉取最新代码...'
    git pull --ff-only

    cd server
    echo '[2/3] 安装依赖...'
    pnpm install --frozen-lockfile

    echo '[3/3] 构建服务端...'
    pnpm run build

    echo '✓ 测试服务器服务端构建完成'
"

echo "[DEPLOY-TEST] 测试服务器部署完成!"
