# 插件消息协议与 API Schema

## 1. 设计目标

本文件把当前设计继续收敛到“可实现接口约定”层，覆盖：

- 浏览器插件内部消息协议
- Page Bridge 与 Background 的认证桥消息
- 服务端 HTTP API 路由
- 核心 request / response schema

目标不是一次定义所有业务字段，而是先把一期主链路的交互边界固定下来，避免插件端和服务端后续各自演化出不兼容接口。

## 2. 适用范围

当前主要覆盖 6 类动作：

1. 当前用户与身份映射校验
2. Meegle `auth code` 申请与 token 兑换
3. `Lark Ticket -> Meegle Workitem` 创建与同步
4. PM 即时分析（含 SLA 统计）
5. Meegle Workitem 总结生成与回写
6. GitHub 分支创建与 PR 关联

补充说明：

- Lark Base 侧为统一的 **Lark Ticket** 表，通过 `Issue 类型` 字段区分后映射到不同 Meegle workitem 类型
- PM 分析已支持真实数据模式（从 Meegle 拉取 workitem）和 Mock 模式
- ACP `V1` 只为 `PM 即时分析` 增加“可会话、可追问、可流式返回”的能力

术语映射（历史参考）：

| 旧代号 | 当前名称 |
|--------|---------|
| `A1` | Lark Ticket（Issue 类型 = Bug） |
| `A2` | Lark Ticket（Issue 类型 = User Story） |
| `B1` | Meegle User Story |
| `B2` | Meegle Product Bug |

- 服务端公开 HTTP 路径已移除 `/api/a1/*` `/api/a2/*` 兼容别名
- 代码内部不再使用 `a1/a2/b1/b2` 命名

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

## 5.3 Lark Ticket → Meegle Workitem 业务接口

Lark Base 侧为统一的 **Lark Ticket** 表，通过 `Issue 类型` 字段区分后映射到不同的 Meegle workitem 类型：

| Lark Issue 类型 | Meegle workitem 类型 | templateId |
|----------------|---------------------|------------|
| `User Story` / `feature` | `story` | `400329` |
| `Tech Task` / `配置` / `数据维护` | `techtask` | `651452` / `690928` |
| `Bug` / `Production Bug` | `production_bug` | `645025` |

映射关系可通过 `server/config/lark-base-workflow.json` 配置，或环境变量 `LARK_BASE_ISSUE_TYPE_MAPPINGS` 覆盖。

### 5.3.1 `POST /api/lark-base/create-meegle-workitem`

单条 Lark Base 记录创建 Meegle workitem。

请求：

```json
{
  "recordId": "rec_xxx",
  "masterUserId": "usr_xxx",
  "baseId": "base_xxx",
  "tableId": "tbl_xxx",
  "projectKey": "PROJ1"
}
```

字段说明：

- `recordId`: 必填，Lark Base 记录 ID
- `masterUserId`: 必填，操作用户主身份 ID
- `baseId`: 可选，默认从环境变量 `LARK_BASE_DEFAULT_BASE_ID` 读取
- `tableId`: 可选，默认从环境变量 `LARK_BASE_DEFAULT_TABLE_ID` 读取
- `projectKey`: 可选，默认从环境变量 `MEEGLE_PROJECT_KEY` 读取

成功响应：

```json
{
  "ok": true,
  "workitemId": "12345",
  "meegleLink": "https://project.larksuite.com/PROJ1/story/detail/12345",
  "recordId": "rec_xxx",
  "workitems": [
    {
      "workitemId": "12345",
      "meegleLink": "https://project.larksuite.com/PROJ1/story/detail/12345"
    }
  ]
}
```

失败响应：

```json
{
  "ok": false,
  "error": {
    "errorCode": "UNKNOWN_ISSUE_TYPE",
    "errorMessage": "Unknown or unsupported Issue 类型: xxx"
  }
}
```

### 5.3.2 `POST /api/lark-base/bulk-preview-meegle-workitems`

批量预览指定视图中可创建的 Lark Base 记录。

请求：

```json
{
  "baseId": "base_xxx",
  "tableId": "tbl_xxx",
  "viewId": "vew_xxx",
  "masterUserId": "usr_xxx"
}
```

成功响应：

```json
{
  "ok": true,
  "data": {
    "eligible": [...],
    "skipped": [...]
  }
}
```

### 5.3.3 `POST /api/lark-base/bulk-create-meegle-workitems`

批量创建指定视图中的 Lark Base 记录对应的 Meegle workitem。

请求参数与 `bulk-preview` 相同。

成功响应：

```json
{
  "ok": true,
  "data": {
    "summary": {
      "created": 5,
      "failed": 1,
      "skipped": 3
    },
    "createdRecords": [...],
    "failedRecords": [...],
    "skippedRecords": [...]
  }
}
```

### 5.3.4 `POST /api/lark-base/update-meegle-link`

手动回写 Meegle 链接到 Lark Base 记录的 `meegle链接` 字段。

请求：

```json
{
  "baseId": "base_xxx",
  "tableId": "tbl_xxx",
  "recordId": "rec_xxx",
  "meegleLink": "https://project.larksuite.com/PROJ1/story/detail/12345",
  "masterUserId": "usr_xxx"
}
```

### 5.3.5 `POST /api/lark-base/get-record-url`

获取 Lark Base 记录的共享 URL。

请求：

```json
{
  "baseId": "base_xxx",
  "tableId": "tbl_xxx",
  "recordId": "rec_xxx",
  "masterUserId": "usr_xxx"
}
```

成功响应：

```json
{
  "ok": true,
  "recordId": "rec_xxx",
  "recordUrl": "https://base.larksuite.com/base/base_xxx/table/tbl_xxx/record/rec_xxx"
}
```

### 5.3.6 `POST /api/meegle/workitem/update-lark-and-push`

反向推送：当 Meegle workitem 状态变更后，更新关联的 Lark Base 记录状态并发送消息。

请求：

```json
{
  "projectKey": "PROJ1",
  "workItemTypeKey": "story",
  "workItemId": "12345",
  "masterUserId": "usr_xxx",
  "baseUrl": "https://project.larksuite.com",
  "larkBaseUrl": "https://open.larksuite.com",
  "larkStatusFieldName": "状态"
}
```

成功响应：

```json
{
  "ok": true,
  "larkBaseUpdated": true,
  "messageSent": true,
  "reactionAdded": true,
  "meegleStatusUpdated": true
}
```

## 5.5 PM 分析接口

### 5.5.1 `POST /api/pm/analysis/run`

周期性项目健康度分析。聚合 Lark Ticket、Meegle Workitem、GitHub PR 三类数据，输出阻塞项、滞留项、SLA 超期统计和建议行动。

支持两种模式：

| 模式 | 条件 | 数据来源 |
|------|------|---------|
| **Mock** | 只传 `projectKeys` | 返回假数据，用于联调/演示 |
| **真实数据** | 额外提供 `masterUserId` + `baseUrl` | 从 Meegle `filterWorkitems` 拉取真实数据 |

请求：

```json
{
  "projectKeys": ["PROJ1"],
  "timeWindowDays": 14,
  "masterUserId": "usr_xxx",
  "baseUrl": "https://project.larksuite.com"
}
```

字段说明：

- `projectKeys`: `string[]` — 必填，要分析的项目 key 列表
- `timeWindowDays`: `number` — 可选，分析时间窗口（天），默认 14
- `masterUserId`: `string` — 可选，用户主身份 ID，提供则走真实数据模式
- `baseUrl`: `string` — 可选，Meegle 实例地址，真实模式必填

成功响应：

```json
{
  "ok": true,
  "summary": "本周期在 14 天窗口内发现 2 个阻塞项、3 个滞留事项、1 个 SLA 超期事项。",
  "blockers": [
    {
      "id": "MeegleWI-blocked-1",
      "projectKey": "PROJ1",
      "status": "blocked",
      "ageDays": 11,
      "createdAt": 1715400000000,
      "elapsedHours": 26,
      "slaTargetHours": 24,
      "slaBreached": true,
      "name": "支付页白屏"
    }
  ],
  "staleItems": [
    {
      "id": "LarkTicket-1",
      "projectKey": "PROJ1",
      "issueType": "Bug",
      "status": "open",
      "ageDays": 15
    }
  ],
  "missingDescriptionItems": [
    {
      "id": "LarkTicket-story-1",
      "projectKey": "PROJ1",
      "reason": "需求已评审但描述仍待补全"
    }
  ],
  "suggestedActions": [
    "2 个阻塞项需要优先跟进",
    "1 个 PR 需要补 review",
    "1 个事项 SLA 已超期"
  ],
  "slaAnalysis": {
    "total": 5,
    "met": 4,
    "breached": 1,
    "breachedItems": [
      {
        "id": "MeegleWI-1",
        "projectKey": "PROJ1",
        "status": "in_progress",
        "ageDays": 3,
        "createdAt": 1715400000000,
        "elapsedHours": 26,
        "slaTargetHours": 24,
        "slaBreached": true,
        "name": "支付页白屏"
      }
    ]
  },
  "totals": {
    "staleLarkTicketCount": 1,
    "staleMeegleWorkitemCount": 2,
    "pendingReviewLarkTicketCount": 1,
    "reviewPendingPrCount": 1,
    "slaBreachedCount": 1
  },
  "items": {
    "staleLarkTickets": [...],
    "staleMeegleWorkitems": [...],
    "pendingReviewLarkTickets": [...],
    "reviewPendingPrs": [...]
  }
}
```

响应字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `summary` | `string` | 一句话分析摘要 |
| `blockers` | `MeegleWorkitem[]` | 状态为 `blocked` 的 workitem |
| `staleItems` | `(LarkTicket \| MeegleWorkitem)[]` | 滞留项汇总 |
| `missingDescriptionItems` | `{id, projectKey, reason}[]` | issueType 含 Story/需求 且 reviewed 的 Lark Ticket |
| `suggestedActions` | `string[]` | 自动生成的行动建议 |
| `slaAnalysis` | `object` | SLA 统计：total/met/breached/breachedItems |
| `totals` | `object` | 各类指标计数 |
| `items` | `object` | 各类明细列表（与 totals 对应） |

失败响应：

```json
{
  "ok": false,
  "error": {
    "errorCode": "INVALID_REQUEST",
    "errorMessage": "..."
  }
}
```

认证过期时：

```json
{
  "ok": false,
  "error": {
    "errorCode": "AUTH_EXPIRED",
    "errorMessage": "Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。"
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

## 5.6 Meegle Workitem 总结接口

### 5.6.1 `POST /api/meegle/workitem/generate-summary`

用途：

- 为单个 Meegle workitem 生成 Markdown 总结草稿
- 自动从 Lark Base 记录、Meegle workitem 本体提取可预填信息
- 返回分区块的 Markdown，人工只需补充结论部分

请求：

```json
{
  "projectKey": "PROJ1",
  "workItemTypeKey": "story",
  "workItemId": "12345",
  "masterUserId": "usr_xxx",
  "baseUrl": "https://project.larksuite.com",
  "larkBaseUrl": "https://open.larksuite.com"
}
```

字段说明：

- `projectKey`: Meegle 项目 key
- `workItemTypeKey`: workitem 类型 api_name（如 `story`, `production_bug`）
- `workItemId`: workitem 数字 ID
- `masterUserId`: 操作用户主身份 ID
- `baseUrl`: Meegle 实例地址
- `larkBaseUrl`: 可选，Lark OpenAPI 地址，默认 `https://open.larksuite.com`

成功响应：

```json
{
  "ok": true,
  "markdown": "## ✅ 核心信息确认...\n## 🎯 产品结论...",
  "workItemType": "story",
  "prefilledSections": ["核心信息确认", "进度状态"],
  "emptySections": ["产品结论", "开发总结", "测试总结"]
}
```

响应字段：

- `markdown`: 完整的 Markdown 总结草稿
- `workItemType`: `story` | `bug` | `unknown`，用于前端决定渲染模板
- `prefilledSections`: AI 已自动预填的区块标题列表
- `emptySections`: 需要人工填写的区块标题列表

失败响应：

```json
{
  "ok": false,
  "error": {
    "errorCode": "INVALID_REQUEST",
    "errorMessage": "..."
  }
}
```

或

```json
{
  "ok": false,
  "error": {
    "errorCode": "AUTH_EXPIRED",
    "errorMessage": "Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。"
  }
}
```

### 5.6.2 `POST /api/meegle/workitem/apply-summary`

用途：

- 将人工编辑后的 Markdown 总结写回 Meegle workitem 的指定字段
- 典型的两步流程：先生成草稿（`generate-summary`），用户编辑后调用本接口保存

请求：

```json
{
  "projectKey": "PROJ1",
  "workItemTypeKey": "story",
  "workItemId": "12345",
  "masterUserId": "usr_xxx",
  "baseUrl": "https://project.larksuite.com",
  "summaryFieldKey": "field_xxx",
  "summaryMarkdown": "## ✅ 核心信息确认\n- [x] 业务背景..."
}
```

字段说明：

- `summaryFieldKey`: Meegle 上用于存储总结的自定义字段 key
- `summaryMarkdown`: 完整的 Markdown 总结内容

成功响应：

```json
{
  "ok": true,
  "workItemId": "12345",
  "summaryFieldKey": "field_xxx"
}
```

失败响应与 `generate-summary` 一致，错误码包含 `INVALID_REQUEST`、`AUTH_EXPIRED`、`SUMMARY_FAILED`。

### 5.6.3 总结字段 Markdown 模板规范

**需求 Story 模板结构**：

```markdown
## ✅ 核心信息确认（description 应包含以下内容，已包含的请打勾）
- [x] 业务背景 & 目标
- [ ] 影响范围
- [x] 验收标准
- [ ] 优先级原因
- [ ] 明确不做范围
- [x] 关联文档链接

> 💡 原始描述信息请查看 workitem 的 description 字段，此处不放重复内容。
> 关联文档：https://...

## 🎯 产品结论（PM 填写 / 确认补充）
- 影响范围（确认/补充）：
- 验收标准（确认/补充）：
- 优先级原因：
- 明确不做：
- 验收人：

## ⚙️ 开发总结（开发填写）
- 技术依赖：
- 技术风险：
- 关键设计决策：

## 🧪 测试总结（测试填写）
- 测试关注点：
- 验证结果：

## 🔗 关联 & 变更（AI 自动维护）
- 关联 Bug：
- 需求变更记录：

## ⏱️ 进度状态（AI 自动计算）
- 来源：xxx / 标签：xxx
- 创建时间：2026-05-11Txx:xx:xx.xxxZ
- 当前节点：见 workflow
```

**Production Bug 模板结构**：

```markdown
## ✅ 核心信息确认（description 应包含以下内容，已包含的请打勾）
- [x] 问题现象
- [ ] 发生环境
- [x] 复现步骤
- [ ] 期望结果
- [x] 实际结果
- [ ] 证据链接

> 💡 原始描述信息请查看 workitem 的 description 字段，此处不放重复内容。
> 关联链接：https://...

## 🔍 测试结论（测试填写 / 确认补充）
- 复现步骤（确认/补充）：
- 期望结果：
- 回归范围：

## 🔧 开发总结（开发填写）
- 根因分析：
- 修复方案：
- 技术影响面：
- 预防措施：

## 📢 产品评估（PM 填写）
- 严重程度：
- 客户影响判断：
- 对外说明口径：

## ⏱️ SLA 分析（AI 自动计算）
- 创建时间：2026-05-11Txx:xx:xx.xxxZ
- 当前已耗时：x天x小时
- SLA 目标：24小时
- SLA 状态：✅ 达标 / ❌ 超期 x小时
```

### 5.6.4 AI 生成模式与 ACP 服务

`generate-summary` 支持两种生成模式，通过环境变量切换：

| 模式 | 环境变量 | 说明 |
|------|---------|------|
| **规则驱动**（默认） | `KIMI_ACP_SERVICE_ENABLED=false` | 纯规则/模板拼接，无 LLM 调用，速度快（~200ms） |
| **AI 生成** | `KIMI_ACP_SERVICE_ENABLED=true` | 调用独立 ACP 服务，由 Kimi AI 基于 workitem 描述生成结构化总结 |

#### 架构

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│   tenways-octo-server        │     │   kimi-acp-service          │
│                              │     │   (独立进程, 单进程常驻)       │
│  POST /generate-summary      │────►│                              │
│    ├── 拉取 workitem          │     │  POST /prompt               │
│    ├── 拉取 Lark 记录         │     │    ├── 请求队列（串行）       │
│    ├── 构造 prompt            │     │    ├── kimi-cli (常驻)       │
│    └── 调用 ACP 服务 ◄────────┘     │    └── 返回 Markdown         │
│                              │     │                              │
│  AI 失败时自动 fallback      │     │  GET /health                │
│  到规则驱动模板               │     │                              │
└─────────────────────────────┘     └─────────────────────────────┘
```

#### ACP 服务接口

`POST http://localhost:3456/prompt`

请求：

```json
{
  "message": "【系统指令】...【任务】请根据以下信息生成总结..."
}
```

响应：

```json
{
  "ok": true,
  "text": "## ✅ 核心信息确认\n...",
  "stopReason": "stop"
}
```

`GET http://localhost:3456/health`

响应：

```json
{
  "ok": true,
  "status": "ready"
}
```

#### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `KIMI_ACP_SERVICE_ENABLED` | `false` | 是否启用 AI 生成模式 |
| `KIMI_ACP_SERVICE_URL` | `http://localhost:3456` | Server 调用 ACP 服务的地址 |
| `KIMI_ACP_SERVICE_PORT` | `3456` | ACP 服务自身的监听端口 |

#### 启动方式

```bash
# 开发（独立终端）
pnpm --dir server acp-service:dev

# 生产
pnpm --dir server acp-service:start
```

#### 设计决策

- **单进程串行**：一个 `kimi acp` 进程同一时间只能处理一个 prompt，请求自动排队
- **常驻预热**：服务启动时立即初始化 runtime，请求时无冷启动
- **自动 fallback**：AI 生成失败（ACP 服务未启动、超时、返回错误）时，自动回退到规则驱动模板，不阻断用户流程
- **上下文隔离**：每个 prompt 开头自带 `【系统指令】请忽略之前的所有对话内容`，避免 Session 上下文污染

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
- `SUMMARY_FAILED`
- `AUTH_EXPIRED`

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
