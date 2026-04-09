# Tenways Octo - 服务端

服务端 API 负责身份解析、Meegle 认证、Lark 到 Meegle 建单编排，以及 PM 即时分析。

## 当前对外术语

| 旧术语 | 当前对外名称 |
|------|------|
| `A1` | `Lark Bug` |
| `A2` | `Lark User Story` |
| `B1` | `Meegle User Story` |
| `B2` | `Meegle Product Bug` |

说明：
- 服务端公开路径使用新命名
- 旧 `/api/a1/*`、`/api/a2/*` 仍保留为兼容别名

## 开发

```bash
pnpm --dir server dev
pnpm --dir server test
pnpm --dir server build
pnpm --dir server start
```

默认地址：`http://localhost:3000`

## 主要接口

### 基础接口

- `GET /health`
- `POST /api/identity/resolve`
- `POST /api/meegle/auth/exchange`
- `POST /api/meegle/auth/status`
- `POST /api/pm/analysis/run`

### Lark Bug -> Meegle Product Bug

主路径：

- `POST /api/lark-bug/analyze`
- `POST /api/lark-bug/to-meegle-product-bug/draft`
- `POST /api/lark-bug/to-meegle-product-bug/apply`

兼容别名：

- `POST /api/a1/analyze`
- `POST /api/a1/create-b2-draft`
- `POST /api/a1/apply-b2`

### Lark User Story -> Meegle User Story

主路径：

- `POST /api/lark-user-story/analyze`
- `POST /api/lark-user-story/to-meegle-user-story/draft`
- `POST /api/lark-user-story/to-meegle-user-story/apply`

兼容别名：

- `POST /api/a2/analyze`
- `POST /api/a2/create-b1-draft`
- `POST /api/a2/apply-b1`

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
| `INTERNAL_ERROR` | 未归类的服务端异常 |

## 模块划分

```text
server/src/
├── adapters/
│   ├── lark/
│   ├── meegle/
│   └── sqlite/
├── application/services/
│   ├── a1-workflow.service.ts
│   ├── a2-workflow.service.ts
│   ├── meegle-apply.service.ts
│   ├── meegle-credential.service.ts
│   ├── meegle-workitem.service.ts
│   └── pm-analysis.service.ts
├── http/
│   └── lark-meegle-workflow-routes.ts
├── modules/
│   ├── a1/
│   ├── a2/
│   ├── identity/
│   ├── meegle-auth/
│   └── pm-analysis/
└── validators/
```
