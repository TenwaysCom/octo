#!/bin/bash
#
# Octo 部署脚本 - 极简版
# 用法: ./scripts/deploy.sh

set -e

# 服务器配置
SSH_HOST="linyu@192.168.0.7"
SSH_PORT="2222"
PROJECT_DIR="~/projects/octo"

echo "[DEPLOY] 连接到服务器更新代码..."

# SSH 执行部署命令
ssh -p "$SSH_PORT" "$SSH_HOST" -t "cd $PROJECT_DIR && git pull && echo '✓ 代码更新完成'"

echo "[DEPLOY] 部署完成!"
