# Tenways Octo - 服务端

服务端 API 负责身份解析、Lark / Meegle 授权、Lark Base 到 Meegle workitem 的建单编排、Lark 回写、GitHub 辅助操作，以及 PM 即时分析。

## 开发

```bash
pnpm --dir server dev
pnpm --dir server test
pnpm --dir server build
pnpm --dir server db:migrate
pnpm --dir server db:import-sqlite
pnpm --dir server start
```

默认地址：`http://localhost:3000`

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

### 基础与配置

- `GET /health`
- `GET /api/config/public`
- `GET /api/extension/version`
- `POST /api/identity/resolve`
- `POST /api/debug/client-log`

### 授权

- `POST /api/meegle/auth/exchange`
- `POST /api/meegle/auth/status`
- `POST /api/lark/auth/exchange`
- `POST /api/lark/auth/refresh`
- `POST /api/lark/auth/status`
- `POST /api/lark/auth/session`
- `GET /api/lark/auth/callback`
- `POST /api/lark/user-info`

### Lark Base 与 Meegle

- `POST /api/lark-base/update-meegle-link`
- `POST /api/lark-base/get-record-url`
- `POST /api/lark-base/create-meegle-workitem`
- `POST /api/lark-base/bulk-preview-meegle-workitems`
- `POST /api/lark-base/bulk-create-meegle-workitems`
- `POST /api/meegle/workitem/update-lark-and-push`

### GitHub

- `POST /api/github/branch/preview`
- `POST /api/github/branch/create`
- `POST /api/github/lookup-meegle`，仅在配置 `GITHUB_TOKEN` 时注册

### 平台数据同步

服务端将每类外部对象分别持久化到 PostgreSQL：`meegle_workitem_syncs`、`github_pr_syncs`、`lark_base_ticket_syncs`。每行保留平台返回的完整 JSON 快照及源更新时间，重复同步按外部对象主键更新。Meegle 另使用 `meegle_sync_mappings` 保存 `workItemTypeKey`、status key 和 sub-stage key 到展示名称的映射；写入 work item 前会转换 `work_item_type`、`status`、`sub_stage`，同时保留原始 key。

- `POST /api/sync/meegle/workitem`：按 `masterUserId`、`projectKey`、`workItemTypeKey`、`workItemId` 同步一条 Meegle work item。
- `POST /api/sync/meegle/workitems`：按 `masterUserId`、`projectKey` 和可选 `workItemTypeKeys` 同步全部未结束 work item。
- `POST /api/sync/github/pull-request`：按 `owner`、`repo`、`pullNumber` 同步一个 GitHub PR；需要服务端 `GITHUB_TOKEN`。
- `POST /api/sync/github/pull-requests`：传入 `repositories: [{ owner, repo }]`，同步每个仓库的开放 PR；需要服务端 `GITHUB_TOKEN`。
- `POST /api/sync/lark-base/ticket`：按 `masterUserId`、`baseId`、`tableId`、`recordId` 同步一个 Base ticket。
- `POST /api/sync/lark-base/tickets`：按 `masterUserId`、`baseId`、`tableId` 全量同步未结束 Base ticket。

以上接口都可携带 `actionRunId`。Base ticket 可选 `titleFieldName` 与 `statusFieldName`；未指定时会尝试 `Title`/`标题` 和 `Status`/`状态`。批量同步会跳过状态为 `terminated`、`cancelled`、`finish`、`finished`、`rejected`、`merged`、`closed` 或 Meegle 的 `end` 的记录（亦识别相应中文状态）；单条同步不做此过滤。

#### 本地批量同步命令

本地批量同步无需启动 HTTP server。先复制配置模板，并在本机配置目标 ID（该文件已被 Git 忽略）：

```bash
cp server/config/platform-sync.local.json.example server/config/platform-sync.local.json
```

```bash
# 按配置依次同步 Meegle、GitHub、Lark Base
pnpm --dir server platform:sync

# Meegle：使用本机已登录的 meegle CLI profile
pnpm --dir server platform:sync --only meegle

# GitHub：使用本机 gh api，按配置同步仓库的开放 PR
pnpm --dir server platform:sync --only github

# Lark Base：使用 PostgreSQL 中该用户已保存的 Lark user token
pnpm --dir server platform:sync --only lark --user-id a400632e-8d08-4ddf-977d-e8330b0adc5a

# 指定用户或另一份目标配置
pnpm --dir server platform:sync --only meegle --user-id USER_ID --config /absolute/path/platform-sync.json
```

默认用户为 `a400632e-8d08-4ddf-977d-e8330b0adc5a`。Meegle 同步通过本机 `meegle` CLI profile 读取，不使用 PostgreSQL 中的 Meegle token；先执行 `meegle auth login`，并可用 `meegle auth status` 验证授权。Lark 仍使用 PostgreSQL 中该用户已保存的凭据；GitHub PR 通过本地 `gh api` 读取，`GITHUB_TOKEN` 可作为 `gh` 的环境凭据。配置文件不得保存 token。所有平台会独立执行；任一平台失败后仍会尝试其余平台，但命令最终以非零状态退出。

本地 Meegle 同步先读取 type/status 元数据，再读取活跃 work item 详情以补全 sub-stage 映射，最后写入已转换的数据。`+batch-get` 是本机 CLI 的逐条读取封装，因此首次同步大量 work item 会产生相应的 Meegle 读取调用。Meegle 请求在单个 server 进程内会串行限流，默认最小间隔为 1000ms。可在 `server/.env` 调整：

```bash
# 每次 Meegle 请求的最小间隔；0 表示关闭本进程限流
MEEGLE_MIN_REQUEST_INTERVAL_MS=1000

# 仅 HTTP 429 会重试；优先遵从 Retry-After，最多重试两次
MEEGLE_RATE_LIMIT_RETRY_COUNT=2
```

`Commercial Usage Exceeded`（`1000051942`）代表商业调用额度耗尽，并非短时频率限制，客户端不会对它自动重试。

#### 单条手工同步命令

以下命令要求先启动 server；`HOST` 默认为 `http://127.0.0.1:3000`。单条同步不会因为状态为终态而拒绝执行。

```bash
export HOST="${HOST:-http://127.0.0.1:3000}"

# Meegle work item
curl -X POST "$HOST/api/sync/meegle/workitem" -H 'Content-Type: application/json' -d '{
  "masterUserId": "USER_ID",
  "projectKey": "PROJECT_KEY",
  "workItemTypeKey": "WORK_ITEM_TYPE_KEY",
  "workItemId": "WORK_ITEM_ID"
}'

# GitHub PR（服务端需要 GITHUB_TOKEN）
curl -X POST "$HOST/api/sync/github/pull-request" -H 'Content-Type: application/json' -d '{
  "owner": "OWNER",
  "repo": "REPO",
  "pullNumber": 123
}'

# Lark Base ticket
curl -X POST "$HOST/api/sync/lark-base/ticket" -H 'Content-Type: application/json' -d '{
  "masterUserId": "USER_ID",
  "larkBaseUrl": "https://open.larksuite.com",
  "baseId": "BASE_ID",
  "tableId": "TABLE_ID",
  "recordId": "RECORD_ID",
  "titleFieldName": "Title",
  "statusFieldName": "Status"
}'
```

### PM Analysis / ACP

- `POST /api/pm/analysis/run`
- `POST /api/acp/kimi/chat`
- `POST /api/acp/kimi/sessions/list`
- `POST /api/acp/kimi/sessions/load`
- `POST /api/acp/kimi/sessions/rename`
- `POST /api/acp/kimi/sessions/delete`

## Lark Base 建单请求约定

单条建单接口 `POST /api/lark-base/create-meegle-workitem` 支持：

- `recordId`
- `masterUserId`
- 可选 `baseId`
- 可选 `tableId`
- 可选 `projectKey`
- 可选 `wikiRecordId`
- 可选 `pageType`，目前为 `lark_base` 或 `lark_wiki_record`

批量预览和批量建单接口支持：

- `baseId`
- `tableId`
- `viewId`
- `masterUserId`

身份解析顺序：

1. 使用 `masterUserId` 构建已认证的 Lark client。
2. 读取 Lark Base 记录与字段。
3. 根据 Issue 类型和 workflow config 解析 Meegle workitem type。
4. 读取或刷新 Meegle credential。
5. 创建 Meegle workitem。
6. 回写 Lark Base 记录中的 Meegle 链接。

## Lark Base 建单响应约定

成功响应：

```json
{
  "ok": true,
  "workitemId": "1234567890",
  "meegleLink": "https://project.larksuite.com/project/4c3fv6/story/detail/1234567890",
  "recordId": "rec_123",
  "workitems": [
    {
      "workitemId": "1234567890",
      "meegleLink": "https://project.larksuite.com/project/4c3fv6/story/detail/1234567890"
    }
  ]
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
- 业务失败返回结构化错误 envelope。
- 输入校验失败返回 `INVALID_REQUEST`。
- 建单成功但后续回写失败时，应保留已创建的 Meegle 信息，并在错误阶段中体现可重试动作。

## 主要错误码

| 错误码 | 含义 |
|------|------|
| `INVALID_REQUEST` | 请求体校验失败 |
| `IDENTITY_NOT_FOUND` | 无法根据 `masterUserId` 解析用户 |
| `MEEGLE_BINDING_REQUIRED` | 已解析用户缺少 `meegleUserKey` 或 `meegleBaseUrl` |
| `MEEGLE_AUTH_REQUIRED` | Meegle 认证缺失、失效或不可刷新 |
| `LARK_AUTH_REQUIRED` | Lark 认证缺失、失效或不可刷新 |
| `MEEGLE_WORKITEM_CREATE_FAILED` | Meegle workitem 创建失败 |
| `UPDATE_FAILED` | Lark Base 建单或回写工作流失败 |
| `PUSH_FAILED` | Meegle workitem 到 Lark 的推送失败 |
| `INTERNAL_ERROR` | 未归类的服务端异常 |

## 模块划分

```text
server/src/
├── adapters/
│   ├── lark/
│   ├── meegle/
│   ├── postgres/
│   └── sqlite/
├── application/services/
│   ├── identity-resolution.service.ts
│   ├── lark-auth-client.factory.ts
│   ├── lark-client.factory.ts
│   ├── meegle-apply.service.ts
│   ├── meegle-credential.service.ts
│   ├── meegle-lark-push.service.ts
│   ├── meegle-workitem.service.ts
│   └── pm-analysis.service.ts
├── http/
│   └── lark-meegle-workflow-routes.ts
├── modules/
│   ├── acp-kimi/
│   ├── debug-log/
│   ├── github-branch-create/
│   ├── identity/
│   ├── lark-auth/
│   ├── lark-base/
│   ├── meegle-auth/
│   ├── meegle-workitem/
│   ├── public-config/
│   └── pm-analysis/
├── routes/
│   └── github-lookup.ts
└── validators/
```

说明：
- `adapters/postgres/` 是当前运行时存储实现
- `adapters/sqlite/` 只保留给旧库读取和一次性数据导入
