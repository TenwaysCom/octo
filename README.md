# Octo - Tenways IT Assistant

跨平台协同助手，帮助用户在 Lark、Meegle、GitHub 之间更高效地推进建单、分析和协作。

## 核心能力

- Lark Base 记录到 Meegle workitem 的半自动建单
- Meegle workitem 状态和 Lark 记录的回写协同
- GitHub 分支创建与交付信息辅助
- PM 即时分析

## 项目结构

```text
octo/
├── extension/              # 浏览器扩展
├── server/                 # 服务端 API
├── docs/                   # 产品、架构、治理与实施文档
├── AGENTS.md               # AI agent 开发规则入口
└── README.md               # 项目入口说明
```

## 快速开始

### 1. 启动服务端

```bash
pnpm --dir server install
pnpm --dir server build
pnpm --dir server start
```

开发模式：

```bash
pnpm --dir server dev
```

服务端默认运行在 `http://localhost:3000`。

### 2. 构建并加载扩展

```bash
pnpm --dir extension install
pnpm --dir extension build
```

构建产物位于 `extension/.output/chrome-mv3/`。

加载方式：

1. 打开 `chrome://extensions/`
2. 启用开发者模式
3. 点击“加载已解压的扩展程序”
4. 选择 `extension/.output/chrome-mv3/`

### 3. 使用流程

1. 打开 Lark Base 记录页面
2. 点击扩展图标，确保身份和授权状态正常
3. 触发预览、建单或 PM 分析
4. 确认结果并同步到 Meegle 或 Lark

## 主要 API

- `GET /health`
- `GET /api/config/public`
- `GET /api/extension/version`
- `POST /api/identity/resolve`
- `POST /api/debug/client-log`
- `POST /api/meegle/auth/exchange`
- `POST /api/meegle/auth/status`
- `POST /api/lark/auth/exchange`
- `POST /api/lark/auth/refresh`
- `POST /api/lark/auth/status`
- `POST /api/lark/auth/session`
- `GET /api/lark/auth/callback`
- `POST /api/lark/user-info`
- `POST /api/lark-base/update-meegle-link`
- `POST /api/lark-base/get-record-url`
- `POST /api/lark-base/create-meegle-workitem`
- `POST /api/lark-base/bulk-preview-meegle-workitems`
- `POST /api/lark-base/bulk-create-meegle-workitems`
- `POST /api/meegle/workitem/update-lark-and-push`
- `POST /api/github/branch/preview`
- `POST /api/github/branch/create`
- `POST /api/acp/kimi/chat`
- `POST /api/pm/analysis/run`

## 开发命令

```bash
pnpm --dir server test
pnpm --dir server build
pnpm --dir extension test
pnpm --dir extension typecheck
pnpm --dir extension build
```

## 文档索引

- [服务端文档](server/README.md)
- [扩展文档](extension/README.md)
- [产品与架构文档索引](docs/tenways-octo/README.md)
- [总体架构](docs/tenways-octo/04-architecture.md)
- [插件消息协议与 API Schema](docs/tenways-octo/11-extension-message-and-api-schema.md)
- [代码结构与校验设计](docs/tenways-octo/13-code-structure-and-validation-design.md)
- [Agent 开发规则入口](AGENTS.md)
- [AI Dev 治理入口](docs/ai-dev/README.md)
- [当前系统技术对象生命周期](docs/ai-dev/lifecycle/current-system-technical-objects.md)
- [系统边界与代码规范](docs/ai-dev/rules/system-boundaries-and-code-rules.md)
