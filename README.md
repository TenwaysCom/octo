# Octo - Tenways IT Assistant

跨平台协同助手，帮助用户在 Lark、Meegle、GitHub 之间更高效地推进建单、分析和协作。

## 核心能力

- `Lark Bug -> Meegle Product Bug` 半自动建单
- `Lark User Story -> Meegle User  Story` 半自动建单
- PM 即时分析

术语映射：

| 旧术语 | 当前对外名称 |
|------|------|
| `A1` | `Lark Bug` |
| `A2` | `Lark User Story` |
| `B1` | `Meegle User Story` |
| `B2` | `Meegle Product Bug` |

说明：
- 服务端公开 HTTP 路径已经切到新命名
- 旧 `/api/a1/*`、`/api/a2/*` 仍保留为兼容别名
- 插件内部消息 action 仍保留 `a1/a2/b1/b2` 命名，避免打断现有扩展协议

## 项目结构

```text
octo/
├── extension/              # 浏览器扩展
├── server/                 # 服务端 API
├── meegle_clients/         # Meegle API 客户端参考
└── docs/                   # 设计文档与实施计划
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

兼容别名：

- `POST /api/a1/analyze`
- `POST /api/a1/create-b2-draft`
- `POST /api/a1/apply-b2`
- `POST /api/a2/analyze`
- `POST /api/a2/create-b1-draft`
- `POST /api/a2/apply-b1`

## 当前状态

已完成：

- 浏览器扩展主链路
- 服务端身份解析与 Meegle 认证
- 新公开 API 路径与旧路径兼容
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
