#!/bin/bash
#
# Octo 正式服务器部署脚本
# 完整流程：git pull + 构建 + PM2 重启
# 用法: ./scripts/deploy-prod.sh

set -e

# 服务器配置
SSH_HOST="linyu@192.168.0.7"
SSH_PORT="2222"
PROJECT_DIR="~/projects/octo"

echo "[DEPLOY-PROD] 连接到正式服务器执行部署..."

ssh -p "$SSH_PORT" "$SSH_HOST" -t "
    set -e
    cd $PROJECT_DIR
    
    echo '[1/4] 拉取最新代码...'
    git pull
    
    echo '[2/4] 安装依赖...'
    cd server
    pnpm install --frozen-lockfile
    
    echo '[3/4] 构建服务端...'
    pnpm run build
    
    echo '[4/4] 重启 PM2 服务...'
    pm2 reload octo-server --update-env || pm2 start dist/index.js --name octo-server
    pm2 save
    
    echo ''
    echo '✓ 正式服务器部署完成'
    echo ''
    pm2 status
"

echo "[DEPLOY-PROD] 正式服务器部署完成!"
