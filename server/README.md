# Tenways Octo - 服务端

服务端 API 负责身份解析、Meegle 认证、Lark 到 Meegle 建单编排、PM 即时分析、Meegle Workitem AI 总结，以及 GitHub 分支创建。

## 当前对外术语

| 旧术语 | 当前对外名称 |
|------|------|
| `A1` | `Lark Bug` |
| `A2` | `Lark User Story` |
| `B1` | `Meegle User Story` |
| `B2` | `Meegle Product Bug` |

说明：
- 服务端公开路径已移除 `/api/a1/*`、`/api/a2/*` 兼容别名
- Lark Base 侧统一为 **Lark Ticket** 表，通过 `Issue 类型` 字段区分后映射到不同 Meegle workitem 类型

## 开发

```bash
# 主 server
pnpm --dir server dev
pnpm --dir server test
pnpm --dir server build
pnpm --dir server start

# ACP AI 服务（独立进程）
pnpm --dir server acp-service:dev     # 开发模式
pnpm --dir server acp-service:start   # 生产模式

# 同时启动 server + ACP 服务
cd .. && make server-acp-dev
```

默认地址：
- 主 server：`http://localhost:3000`
- ACP 服务：`http://localhost:3456`

## 数据库

运行时存储现在使用 PostgreSQL，连接串从 `POSTGRES_URI` 读取。

常用命令：

```bash
pnpm --dir server db:migrate
pnpm --dir server db:reset
pnpm --dir server db:import-sqlite -- --sqlite ./data/tenways-octo.sqlite
```

推荐迁移顺序：

1. 在 `server/.env` 或进程环境里配置 `POSTGRES_URI`
2. 运行 `pnpm --dir server build`
3. 运行 `pnpm --dir server db:migrate`
4. 如果要导入旧 SQLite 数据，运行 `pnpm --dir server db:import-sqlite -- --sqlite ./data/tenways-octo.sqlite`
5. 启动服务，后续运行时只使用 PostgreSQL

## 主要接口

### 基础接口

- `GET /health`
- `POST /api/identity/resolve`
- `POST /api/meegle/auth/exchange`
- `POST /api/meegle/auth/status`
- `POST /api/pm/analysis/run`

### Lark Ticket -> Meegle Workitem

- `POST /api/lark-base/create-meegle-workitem` — 单条建单
- `POST /api/lark-base/bulk-preview-meegle-workitems` — 批量预览
- `POST /api/lark-base/bulk-create-meegle-workitems` — 批量建单
- `POST /api/lark-base/update-meegle-link` — 回写 Meegle 链接
- `POST /api/lark-base/get-record-url` — 获取记录 URL

### Meegle Workitem 总结

- `POST /api/meegle/workitem/generate-summary` — 生成 Markdown 总结
- `POST /api/meegle/workitem/apply-summary` — 回写总结到字段

### GitHub

- `POST /api/github-branch-create/create-branch` — 创建分支

## Apply 请求约定

`apply` 请求目前支持：

- `requestId`
- 可选 `masterUserId`
- `operatorLarkId`
- `draftId`
- `sourceRecordId`
- `idempotencyKey`
- `confirmedDraft`

身份解析顺序：

1. 优先使用 `masterUserId`
2. 缺失时使用 `operatorLarkId` 反查
3. 解析到用户后，读取 `meegleUserKey` 和 `meegleBaseUrl`
4. 刷新 Meegle credential
5. 创建 `MeegleClient`
6. 调用 Meegle create workitem

## Apply 响应约定

成功响应：

```json
{
  "status": "created",
  "workitemId": "1234567890",
  "draft": {
    "draftId": "draft_b2_rec_001"
  }
}
```

业务错误响应：

```json
{
  "ok": false,
  "error": {
    "errorCode": "MEEGLE_AUTH_REQUIRED",
    "errorMessage": "Meegle auth is required"
  }
}
```

说明：
- 成功响应当前直接返回工作流结果对象
- 业务失败返回结构化错误 envelope
- `idempotencyKey` 会透传到 Meegle create 请求头，避免重复 apply 时重复建单

## 主要错误码

| 错误码 | 含义 |
|------|------|
| `INVALID_REQUEST` | 请求体校验失败 |
| `IDENTITY_NOT_FOUND` | 无法根据 `masterUserId` / `operatorLarkId` 解析用户 |
| `MEEGLE_BINDING_REQUIRED` | 已解析用户缺少 `meegleUserKey` 或 `meegleBaseUrl` |
| `MEEGLE_AUTH_REQUIRED` | Meegle 认证缺失、失效或不可刷新 |
| `MEEGLE_WORKITEM_CREATE_FAILED` | Meegle workitem 创建失败 |
| `SUMMARY_FAILED` | 总结生成失败 |
| `INTERNAL_ERROR` | 未归类的服务端异常 |

## 模块划分

```text
server/src/
├── adapters/
│   ├── lark/
│   ├── meegle/
│   ├── postgres/
│   ├── sqlite/
│   └── kimi-acp/
├── application/services/
│   ├── lark-base-workflow.service.ts
│   ├── meegle-apply.service.ts
│   ├── meegle-credential.service.ts
│   ├── meegle-workitem.service.ts
│   ├── pm-analysis.service.ts
│   └── acp-kimi-proxy.service.ts
├── http/
│   └── api-request-logger.ts
├── modules/
│   ├── identity/
│   ├── meegle-auth/
│   ├── meegle-workitem/
│   ├── meegle-summary/
│   ├── lark-base/
│   ├── lark-auth/
│   ├── pm-analysis/
│   ├── acp-kimi/
│   ├── github-branch-create/
│   └── debug-log/
├── kimi-acp-service/
│   └── index.ts              # 独立 ACP HTTP 服务
└── scripts/
    └── database-migrate.ts
```

## 日志文件

| 文件 | 内容 |
|------|------|
| `logs/app.log` | 业务模块和服务日志 |
| `logs/api.log` | HTTP 请求和响应日志 |
| `logs/acp.log` | ACP 服务和 Kimi runtime 日志 |

通过环境变量自定义路径：

```bash
LOG_FILE=./logs/app.log
API_LOG_FILE=./logs/api.log
ACP_LOG_FILE=./logs/acp.log
```

说明：
- `adapters/postgres/` 是当前运行时存储实现
- `adapters/sqlite/` 只保留给旧库读取和一次性数据导入
- `kimi-acp-service/` 是独立 ACP 服务进程，生产环境由 pm2 单独管理
