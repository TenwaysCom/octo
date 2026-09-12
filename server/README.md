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

### 通过 SSH 连接 PostgreSQL

默认直接使用 `POSTGRES_URI`。当数据库仅能从堡垒机访问时，在 `server/.env` 或进程环境中启用 tunnel：

```env
POSTGRES_URI=postgres://db_user:db_password@postgres.internal:5432/tenways_octo
DATABASE_SSH_ENABLED=true
DATABASE_SSH_HOST=bastion.example.com
DATABASE_SSH_PORT=22
DATABASE_SSH_USER=octo
DATABASE_SSH_IDENTITY_FILE=/run/secrets/octo-postgres
DATABASE_SSH_AUTH_SOCK=/run/user/1000/ssh-agent.sock
DATABASE_SSH_KNOWN_HOSTS_FILE=/etc/octo/ssh_known_hosts
DATABASE_SSH_REMOTE_HOST=postgres.internal
DATABASE_SSH_REMOTE_PORT=5432
DATABASE_SSH_CONNECT_TIMEOUT_MS=10000
```

运行时会以 `ssh -N -L` 建立仅绑定 `127.0.0.1` 的临时 tunnel，并让服务、迁移、导入、备份/恢复和 token 同步脚本复用它。SSH 固定使用 `BatchMode=yes`、`ExitOnForwardFailure=yes`、`StrictHostKeyChecking=yes`；未通过 `known_hosts` 校验、SSH Agent 不可用、缺少配置或 tunnel 超时都会拒绝启动。

私钥口令必须由 SSH Agent 管理，不要写入 `.env`。私钥文件应为专用部署密钥且权限为 `600`，`DATABASE_SSH_KNOWN_HOSTS_FILE` 应由运维预先维护。在 PM2 下必须把相同的 `SSH_AUTH_SOCK` 传给服务进程；可先用 `ssh-add -l` 在该进程身份下确认 Agent 可见。

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
- `GET /api/web/github-pr-odoo-devops-build?owner=...&repo=...&pullNumber=...`：供扩展在 GitHub PR 页面读取 Odoo.sh 构建状态；要求已有 `octo_web_session`、服务端 `GITHUB_TOKEN`，并且仓库已映射到 `eu`、`uk` 或 `us`。该接口不会接收 Odoo.sh cookie。

扩展后台以浏览器自动附带的 HttpOnly Octo Web 会话访问该只读接口；部署时把已发布扩展的精确 origin 写入 `OCTO_EXTENSION_ORIGINS`（逗号分隔），例如：

```bash
OCTO_EXTENSION_ORIGINS=chrome-extension://EXTENSION_ID
```

不要使用 `*` 或把浏览器 cookie 复制到扩展配置中。

### 平台数据同步

完整的范围、认证边界、当前实现、已知限制、清洗规则和增量演进设计统一维护在 [IT Platform Sync](../docs/tenways-octo/it-platform-sync.md)。本 README 不重复维护同步行为说明。

### PM Analysis / ACP

Ticket Answer / Document 与三个 Sprint Quick Actions 的新会话使用 Hermes 原生 ACP；运行节点需准备 Hermes Python 环境。配置见下方 [Hermes ACP](#hermes-acp)，协议验证见 [测试说明](scripts/hermes-acp/README.md)。已有 Kimi 会话及其他 ACP 入口保持兼容。

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

### Hermes ACP

Hermes adapter 用 `HERMES_ACP_PYTHON`（默认 `$HERMES_HOME/hermes-agent/venv/bin/python`）执行官方 `-m acp_adapter`。`HERMES_HOME` 默认 `~/.hermes`，模型、认证、审批和原生会话 DB 复用该目录配置；安装与状态目录分离时显式设置 Python 路径。启动不再调用仓库 launcher、补丁或 Git。`KIMI_ACP_STARTUP_TIMEOUT_MS` 沿用为共用 transport 的启动/加载超时，默认 30 秒。

运行前需要 schema 中可空的 `acp_kimi_session_owners.agent_provider` / `agent_session_id`。迁移代码已提供，执行属于部署步骤。新会话先保存映射及业务引用再调用模型，旧记录读取时补齐历史身份。不要修改 Hermes 原生 ID 或丢弃旧 `hermes_` 前缀。

Hermes 使用原生风险审批，建议起步采用 `manual`，`smart` 按实际版本验证。Octo 不设置 YOLO 或永久 allowlist；原生请求由已登录用户选择原生 options，默认单次允许，宿主等待 50 秒。后台模式需要审批时取消本轮并记录配置错误。Kimi 的能力声明和路径白名单不限制 Hermes 原生工具；Document 多位置及 Terminal 间接写入隔离需在目标节点单独验证。

Hermes 0.14 的部分模型异常会变成普通文本加 `end_turn`，并非结构化失败；Octo 不解析模型文字猜测成功。协议拒绝/取消/进程错误与权限失败有明确终态，业务仍需校验材料、草稿与正式写回。上游错误边界、文件隔离和真实业务验证见 [实施任务](../docs/tasks/acp/2026-09-05-hermes-acp-integration.md)。
