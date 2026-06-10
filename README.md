# Octo - Tenways IT Assistant

跨平台协同助手，帮助用户在 Lark、Meegle、GitHub 之间更高效地推进建单、分析和协作。

## README 与 AGENTS.md 的分工

- `README.md` 面向项目成员：说明产品是什么、如何启动、主要能力、公开 API、当前状态和文档入口。
- `AGENTS.md` 面向 AI agent / coding agent：说明修改代码前必须遵守的分层边界、读取规则、测试规则、日志规则和工作方式。
- 业务背景、架构索引、运行命令放在 `README.md`；会影响 agent 如何改代码的硬规则放在 `AGENTS.md`。
- 更细的工程治理、生命周期、代码规范、问题优先级和模板放在 `docs/ai-dev/`，由 `AGENTS.md` 路由给 agent 读取。

## 核心能力

- `Lark Bug ->  Meegle Product Bug` 半自动建单
- `Lark User Story -> Meegle User  Story` 半自动建单
- PM 即时分析

当前公开命名使用 `Lark Bug`、`Lark User Story`、`Meegle Product Bug`、`Meegle User Story`。旧 `A1/A2/B1/B2` 命名和旧 `/api/a1/*`、`/api/a2/*` 路由不再作为新开发入口。

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

1. 打开 Lark 页面，进入 `Lark Bug` 或 `Lark User Story`
2. 点击扩展图标，确保身份和授权状态正常
3. 触发分析或建草稿
4. 确认草稿后提交到 Meegle

## 主要 API

- `GET /health`
- `POST /api/identity/resolve`
- `POST /api/meegle/auth/exchange`
- `POST /api/meegle/auth/status`
- `POST /api/lark-bug/analyze`
- `POST /api/lark-bug/to-meegle-product-bug/draft`
- `POST /api/lark-bug/to-meegle-product-bug/apply`
- `POST /api/lark-user-story/analyze`
- `POST /api/lark-user-story/to-meegle-user-story/draft`
- `POST /api/lark-user-story/to-meegle-user-story/apply`
- `POST /api/pm/analysis/run`

## 当前状态

已完成：

- 浏览器扩展主链路
- 服务端身份解析与 Meegle 认证
- 当前公开 API 路径
- 真实 Meegle apply 建单链路
- apply 侧 `idempotencyKey` 透传
- 主要单测、全量测试和 build 验证

待补：

- 真实 Lark API 集成
- 真实 Meegle catalog / field 元数据映射
- 数据库持久化增强
- AI Agent 实现
- GitHub API 集成
- 审计日志

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
- [总体架构](docs/tenways-octo/04-architecture.md)
- [插件消息协议与 API Schema](docs/tenways-octo/11-extension-message-and-api-schema.md)
- [代码结构与校验设计](docs/tenways-octo/13-code-structure-and-validation-design.md)
- [AI Dev 治理入口](docs/ai-dev/README.md)
- [当前系统技术对象生命周期](docs/ai-dev/lifecycle/current-system-technical-objects.md)
- [系统边界与代码规范](docs/ai-dev/rules/system-boundaries-and-code-rules.md)
