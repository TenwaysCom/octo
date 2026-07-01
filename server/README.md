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
