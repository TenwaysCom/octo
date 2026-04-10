#!/bin/bash
#
# Octo 测试服务器部署脚本
# 仅执行 git pull 更新代码
# 用法: ./scripts/deploy-test.sh

set -e

# 服务器配置
SSH_HOST="linyu@192.168.0.7"
SSH_PORT="2233"
PROJECT_DIR="~/projects/octo"

echo "[DEPLOY-TEST] 连接到测试服务器更新代码..."

ssh -p "$SSH_PORT" "$SSH_HOST" -t "cd $PROJECT_DIR && git pull && echo '✓ 测试服务器代码更新完成'"

echo "[DEPLOY-TEST] 测试服务器部署完成!"
