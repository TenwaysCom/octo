#!/bin/bash
#
# Octo 正式服务器部署脚本
# 完整流程：git pull + 同步版本号 + 构建 + PM2 重启
# 用法: ./scripts/deploy-prod-full.sh

set -e

# 服务器配置
SSH_HOST="linyu@58.60.106.226"
SSH_PORT="2233"
PROJECT_DIR="~/projects/octo"

# 读取扩展当前版本号
EXT_VERSION=$(node -p "require('./extension/package.json').version")
echo "[DEPLOY-PROD] 扩展版本: $EXT_VERSION"

echo "[DEPLOY-PROD] 连接到正式服务器执行部署..."

ssh -p "$SSH_PORT" "$SSH_HOST" -t "
    set -e
    export NVM_DIR=\"\$HOME/.nvm\"
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    nvm use 22 >/dev/null
    export PATH=\"\$HOME/.local/share/pnpm:\$PATH\"
    cd $PROJECT_DIR
    
    echo '[1/5] 拉取最新代码...'
    git pull
    
    echo '[2/5] 同步扩展版本号到服务器 .env...'
    sed -i \"s/^EXTENSION_LATEST_VERSION=.*/EXTENSION_LATEST_VERSION=$EXT_VERSION/\" server/.env
    
    echo '[3/5] 安装依赖...'
    cd server
    pnpm install --frozen-lockfile
    
    echo '[4/5] 构建服务端...'
    pnpm run build
    
    echo '[5/6] 重启 PM2 主服务...'
    pm2 reload octo-server --update-env || pm2 start dist/index.js --name octo-server
    
    echo '[6/6] 重启 PM2 ACP 服务...'
    pm2 reload octo-acp-service --update-env || pm2 start dist/kimi-acp-service/index.js --name octo-acp-service
    
    pm2 save
    
    echo ''
    echo '✓ 正式服务器部署完成'
    echo ''
    pm2 status
"

echo "[DEPLOY-PROD] 正式服务器部署完成!"
