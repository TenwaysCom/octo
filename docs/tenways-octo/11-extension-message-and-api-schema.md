# 插件消息协议与 API Schema

## 1. 设计目标

本文件把当前设计继续收敛到“可实现接口约定”层，覆盖：

- 浏览器插件内部消息协议
- Page Bridge 与 Background 的认证桥消息
- 服务端 HTTP API 路由
- 核心 request / response schema

目标不是一次定义所有业务字段，而是先把一期主链路的交互边界固定下来，避免插件端和服务端后续各自演化出不兼容接口。

## 2. 适用范围

一期主要覆盖 5 类动作：

1. 当前用户与身份映射校验
2. Meegle `auth code` 申请与 token 兑换
3. `A1 -> B2` 分析与半自动建单
4. `A2 -> B1` 分析与半自动建单
5. PM 即时分析

补充说明：

- 当前正式业务主链路仍是 `A1/A2 + PM 即时分析`
- ACP `V1` 只为 `PM 即时分析` 增加“可会话、可追问、可流式返回”的能力
- ACP `V1` 不要求把 A1/A2 一起迁移到 ACP 协议

## 3. 协议设计原则

1. 插件内消息和服务端 API 都使用显式 `action` / `status`，不做隐式行为。
2. 所有写操作分成 `draft` 和 `apply` 两步。
3. 所有错误都返回结构化 `errorCode / errorMessage / recoverable`。
4. Meegle 正式认证链路固定走 `方案 B`：插件直接拿 `auth code`，服务端不接收原始 `Cookie`。
5. 同一类请求优先复用统一 envelope，降低前后端协议复杂度。

## 4. 插件内部消息协议

## 4.1 通用消息 Envelope

所有插件内部消息建议统一为：

```json
{
  "requestId": "req_20260320_001",
  "action": "itdog.meegle.auth.ensure",
  "payload": {},
  "meta": {
    "pageType": "lark_a1",
    "sentAt": "2026-03-20T12:00:00+08:00"
  }
}
```

字段说明：

- `requestId`: 一次交互链路唯一 ID，用于日志串联
- `action`: 动作名
- `payload`: 动作参数
- `meta.pageType`: 当前页面类型
- `meta.sentAt`: 发送时间

统一响应：

```json
{
  "requestId": "req_20260320_001",
  "ok": true,
  "status": "ready",
  "data": {},
  "error": null
}
```

失败时：

```json
{
  "requestId": "req_20260320_001",
  "ok": false,
  "status": "failed",
  "data": null,
  "error": {
    "errorCode": "MEEGLE_NOT_LOGGED_IN",
    "errorMessage": "当前 Meegle 未登录",
    "recoverable": true
  }
}
```

## 4.2 UI -> Background 动作

### 4.2.1 `itdog.identity.resolve`

用途：

- 解析当前页面识别到的 `Lark ID / meegleUserKey / githubId`
- 查询本地或服务端的身份映射状态

请求 payload：

```json
{
  "pageContext": {
    "pageType": "lark_a1",
    "url": "https://example.feishu.cn/base/...",
    "detectedLarkId": "ou_xxx"
  }
}
```

响应 data：

```json
{
  "operatorLarkId": "ou_xxx",
  "mappingStatus": "bound",
  "meegleUserKey": "user_xxx",
  "githubId": "octocat"
}
```

### 4.2.2 `itdog.meegle.auth.ensure`

用途：

- 检查当前是否已有可用的 Meegle 用户态 token
- 如果没有，则拉起 `auth code` 申请并兑换

请求 payload：

```json
{
  "operatorLarkId": "ou_xxx",
  "meegleUserKey": "user_xxx",
  "baseUrl": "https://project.larksuite.com"
}
```

响应 data：

```json
{
  "tokenStatus": "ready",
  "credentialStatus": "active",
  "expiresAt": "2026-03-20T14:00:00+08:00"
}
```

可能状态：

- `ready`
- `require_auth_code`
- `require_binding`
- `failed`

### 4.2.3 `itdog.a1.analyze`

用途：

- 对当前 A1 记录做智能分析
- 返回“直接处理 / 转 B2 / 转 A2”的判断和缺失信息

请求 payload：

```json
{
  "operatorLarkId": "ou_xxx",
  "recordId": "recA1_001",
  "pageContext": {
    "pageType": "lark_a1",
    "baseId": "app_xxx",
    "tableId": "tbl_A1"
  }
}
```

### 4.2.4 `itdog.a1.create_b2_draft`

用途：

- 结合 A1 最新数据和 Meegle 元数据，生成可确认的 B2 草稿

### 4.2.5 `itdog.a1.apply_b2`

用途：

- 用户确认草稿后，正式创建 B2

### 4.2.6 `itdog.a2.analyze`

用途：

- 对 A2 需求做结构化分析与补全

### 4.2.7 `itdog.a2.create_b1_draft`

用途：

- 生成进入 B1 的可执行 workitem 草稿

### 4.2.8 `itdog.a2.apply_b1`

用途：

- 用户确认后，正式创建 B1

### 4.2.9 `itdog.pm.analysis.run`

用途：

- 触发跨平台即时分析

请求 payload：

```json
{
  "operatorLarkId": "ou_xxx",
  "scope": {
    "projectKeys": ["PROJ1"],
    "timeRange": {
      "from": "2026-03-01",
      "to": "2026-03-20"
    }
  }
}
```

### 4.2.10 ACP `V1` 的 PM 分析入口说明

为支持流式输出和会话复用，ACP `V1` 的 PM 分析不强制走新的 `UI -> Background` action。

当前建议：

- Popup 直接调用服务端 `POST /api/acp/pm-analysis/chat`
- 使用 `fetch + readable stream` 消费流式响应
- Background 仍保留现有认证、页面桥和 legacy 动作职责

这样可以避免为了 PM 分析对话能力额外引入一层不必要的扩展内部流式转发。

## 4.3 Background -> Page Bridge 动作

## 4.3.1 `itdog.page.meegle.auth_code.request`

这是 `方案 B` 的关键动作。

请求 payload：

```json
{
  "requestId": "req_20260320_001",
  "pluginId": "MII_ABD86EEDB9E8CA36",
  "state": "state_req_20260320_001"
}
```

响应 data：

```json
{
  "authCode": "34f3d067e6eb42fa89106c101ebba3d8",
  "state": "state_req_20260320_001",
  "issuedAt": "2026-03-20T12:00:05+08:00"
}
```

失败 errorCode 建议：

- `MEEGLE_PAGE_NOT_READY`
- `MEEGLE_NOT_LOGGED_IN`
- `AUTH_CODE_REQUEST_FAILED`
- `AUTH_CODE_STATE_MISMATCH`

## 5. 服务端 HTTP API 设计

## 5.1 通用响应 Envelope

建议所有服务端接口统一为：

```json
{
  "ok": true,
  "requestId": "req_20260320_001",
  "data": {},
  "error": null
}
```

失败：

```json
{
  "ok": false,
  "requestId": "req_20260320_001",
  "data": null,
  "error": {
    "errorCode": "IDENTITY_NOT_BOUND",
    "errorMessage": "当前用户尚未绑定 Meegle userKey",
    "recoverable": true
  }
}
```

## 5.2 身份与认证接口

### 5.2.1 `POST /api/identity/resolve`

用途：

- 根据当前页面识别结果返回统一主身份和映射状态

请求：

```json
{
  "requestId": "req_20260320_001",
  "pageType": "lark_a1",
  "detected": {
    "larkId": "ou_xxx",
    "meegleUserKey": null,
    "githubId": null
  }
}
```

响应：

```json
{
  "ok": true,
  "requestId": "req_20260320_001",
  "data": {
    "operatorLarkId": "ou_xxx",
    "mappingStatus": "bound",
    "meegleUserKey": "user_xxx",
    "githubId": "octocat"
  },
  "error": null
}
```

### 5.2.2 `POST /api/meegle/auth/exchange`

用途：

- 用插件上传的 `authCode` 兑换并缓存 Meegle 用户态 token

请求：

```json
{
  "requestId": "req_20260320_001",
  "operatorLarkId": "ou_xxx",
  "meegleUserKey": "user_xxx",
  "baseUrl": "https://project.larksuite.com",
  "authCode": "34f3d067e6eb42fa89106c101ebba3d8",
  "state": "state_req_20260320_001"
}
```

响应：

```json
{
  "ok": true,
  "requestId": "req_20260320_001",
  "data": {
    "tokenStatus": "ready",
    "credentialStatus": "active",
    "expiresAt": "2026-03-20T14:00:00+08:00"
  },
  "error": null
}
```

### 5.2.3 `POST /api/meegle/auth/status`

用途：

- 查询当前用户对指定 `baseUrl` 是否已有可用 token

响应状态建议：

- `ready`
- `refreshing`
- `require_auth_code`
- `require_binding`
- `expired`

## 5.3 A1 业务接口

### 5.3.1 `POST /api/a1/analyze`

响应 data 建议：

```json
{
  "summary": "该工单更适合进入产线 Bug",
  "decision": "to_b2",
  "missingFields": ["environment", "repro_steps"],
  "riskLevel": "medium",
  "nextActions": ["补充环境信息", "生成 B2 草稿"]
}
```

### 5.3.2 `POST /api/a1/create-b2-draft`

响应 data 建议：

```json
{
  "draftId": "draft_b2_001",
  "target": {
    "projectKey": "PROJ1",
    "workitemTypeKey": "bug"
  },
  "draft": {
    "name": "支付页白屏",
    "templateId": 123,
    "fieldValuePairs": [
      {
        "fieldKey": "description",
        "fieldValue": "..."
      }
    ]
  },
  "missingMeta": [],
  "needConfirm": true
}
```

### 5.3.3 `POST /api/a1/apply-b2`

请求应包含：

- `draftId`
- `operatorLarkId`
- `sourceRecordId`
- `confirmedDraft`

响应应包含：

- `workitemId`
- `workitemKey`
- `projectKey`
- `workitemTypeKey`

## 5.4 A2 业务接口

### 5.4.1 `POST /api/a2/analyze`

### 5.4.2 `POST /api/a2/create-b1-draft`

### 5.4.3 `POST /api/a2/apply-b1`

这三组接口的结构与 A1 保持一致，只是目标类型改为 B1 对应的 `workitem_type_key`。

## 5.5 PM 分析接口

### 5.5.1 `POST /api/pm/analysis/run`

这是当前保留的 legacy 一次性分析接口。

请求：

```json
{
  "requestId": "req_20260320_001",
  "operatorLarkId": "ou_xxx",
  "scope": {
    "projectKeys": ["PROJ1"],
    "timeRange": {
      "from": "2026-03-01",
      "to": "2026-03-20"
    }
  }
}
```

### 5.5.2 `POST /api/acp/pm-analysis/chat`

这是 ACP `V1` 的 PM 分析对话接口。

设计目标：

- 首问创建 session
- 追问复用同一个 session
- 单个 `POST` 请求直接返回流式事件
- 不拆成“先建 session，再单独连流”的两段式协议

请求：

```json
{
  "sessionId": "optional_existing_session",
  "operatorLarkId": "ou_xxx",
  "projectKeys": ["PROJ1"],
  "timeWindowDays": 14,
  "message": "先给我分析当前项目风险"
}
```

追问请求：

```json
{
  "sessionId": "sess_pm_001",
  "operatorLarkId": "ou_xxx",
  "projectKeys": ["PROJ1"],
  "timeWindowDays": 14,
  "message": "哪些 blocker 最需要今天推进？"
}
```

响应：

- `Content-Type: text/event-stream`
- Popup 侧通过 `fetch + readable stream` 消费

事件建议：

```text
event: session.created
data: {"sessionId":"sess_pm_001"}

event: analysis.started
data: {"phase":"pm-analysis","message":"正在分析项目状态"}

event: analysis.progress
data: {"phase":"pm-analysis","message":"正在聚合 blocker 与 stale item"}

event: analysis.result
data: {
  "sessionId":"sess_pm_001",
  "data":{
    "summary":"本周期有 3 个事项阻塞超过 5 天",
    "blockers":[],
    "staleItems":[],
    "missingDescriptionItems":[],
    "suggestedActions":[]
  }
}

event: followup.result
data: {
  "sessionId":"sess_pm_001",
  "data":{
    "answer":"优先推进支付链路和登录链路相关 blocker",
    "basedOn":["blockers","suggestedActions"]
  }
}

event: error
data: {
  "errorCode":"ACP_SESSION_NOT_FOUND",
  "errorMessage":"会话不存在或已过期",
  "recoverable":true
}

event: done
data: {"sessionId":"sess_pm_001"}
```

约束：

- `V1` follow-up 为规则化 follow-up，不引入完整 LLM runtime
- `V1` session 由 `Managed Redis` 持久化，并使用 TTL
- `V1` 不提供 session 列表、多线程切换或通用 ACP gateway

响应：

```json
{
  "ok": true,
  "requestId": "req_20260320_001",
  "data": {
    "summary": "本周期有 3 个事项阻塞超过 5 天",
    "blockers": [],
    "staleItems": [],
    "missingDescriptionItems": [],
    "suggestedActions": []
  },
  "error": null
}
```

## 6. 错误码建议

建议先统一一版跨层错误码：

- `IDENTITY_NOT_BOUND`
- `MEEGLE_AUTH_REQUIRED`
- `MEEGLE_NOT_LOGGED_IN`
- `MEEGLE_AUTH_CODE_EXPIRED`
- `MEEGLE_TOKEN_REFRESH_FAILED`
- `MEEGLE_META_MISSING`
- `MEEGLE_CREATE_FAILED`
- `A1_RECORD_NOT_FOUND`
- `A2_RECORD_NOT_FOUND`
- `SCHEMA_VALIDATION_FAILED`
- `PARTIAL_DATA_UNAVAILABLE`
- `ACP_SESSION_NOT_FOUND`
- `ACP_SESSION_EXPIRED`
- `ACP_UNSUPPORTED_FOLLOWUP`
- `ACP_STREAM_INIT_FAILED`

## 7. 幂等与追踪建议

每次关键动作都应带：

- `requestId`
- `operatorLarkId`
- `sourceRecordId`
- `draftId`（如果有）
- `idempotencyKey`

其中：

- 插件侧 `requestId` 用于一次交互串联
- 服务端 `idempotencyKey` 用于防重复创建
- Meegle 写操作继续映射到 `X-IDEM-UUID`

## 8. 一期实现建议

建议实现顺序：

1. 先固定插件内部 `action` 命名
2. 先实现 `auth.exchange`、`a1.analyze`、`a1.create-b2-draft`
3. 再补 `a2.*`
4. 最后补 `pm.analysis.run`

如果要落 ACP `V1`，建议插入一个明确阶段：

5. 保留 `pm.analysis.run` 作为 legacy baseline
6. 新增 `POST /api/acp/pm-analysis/chat`，为 PM 分析提供 session + streaming + follow-up

这样可以先跑通 A1 主链路，再逐步复制到 A2 和 PM 分析。
