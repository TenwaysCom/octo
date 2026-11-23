# Octo - Tenways IT Assistant

Tenways IT 协同助手，连接 Lark 工单、Meegle 研发工作项、GitHub PR 和 Odoo.sh 构建信息。

## 核心能力

- Web 工作台查看工单、研发工作项、Sprint 历史和 PR
- 浏览器插件触发跨平台建单、回写、GitHub 分支动作和 PM 即时分析
- IT 工单分析、Wiki 问答、ACP 会话和评测
- 按配置同步外部平台数据，登记 Lark 群话题并处理完成表情

## 项目结构

```text
octo/
├── extension/              # 浏览器扩展
├── fe/                     # Web 工作台与 Lark Ticket AI 应用
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

- `GET /api/health`
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
- `GET /api/lark/auth/web/start`
- `GET /api/lark/auth/web/ensure`
- `POST /api/lark/auth/web/logout`
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
- [Web 工作台文档](fe/README.md)
- [扩展文档](extension/README.md)
- [Octo 领域与产品文档](docs/tenways-octo/README.md)
- [Octo 领域术语表](docs/tenways-octo/GLOSSARY.md)
- [总体架构](docs/tenways-octo/04-architecture.md)
- [插件消息协议与 API Schema](docs/tenways-octo/11-extension-message-and-api-schema.md)
- [代码结构与校验设计](docs/tenways-octo/13-code-structure-and-validation-design.md)
- [Agent 开发规则入口](AGENTS.md)
- [AI Dev 治理入口](docs/ai-dev/README.md)
- [当前系统技术对象生命周期](docs/ai-dev/lifecycle/current-system-technical-objects.md)
- [系统边界与代码规范](docs/ai-dev/rules/system-boundaries-and-code-rules.md)
