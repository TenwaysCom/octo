# IT PM Assistant - 服务端

服务端 API，提供 Lark 到 Meegle 工单创建的智能编排能力。

## 功能

- **身份解析** - 解析 Lark ID 并映射到 Meegle userKey 和 GitHub ID
- **Meegle 认证** - auth code 交换、token 刷新、认证状态管理
- **A1 工单分析** - 智能分析 Lark A1 工单，生成 B2 Bug 草稿
- **A2 需求分析** - 智能分析 Lark A2 需求，生成 B1 任务草稿
- **PM 即时分析** - 跨平台（Lark + Meegle + GitHub）项目状态分析

## 快速开始

### 安装

```bash
cd server
npm install
```

### 开发

```bash
# 监听模式
npm run dev

# 运行测试
npm test
```

### 启动

```bash
npm start
```

服务端默认运行在 `http://localhost:3000`

## API 接口

### 健康检查

```bash
GET /health

# 响应
{
  "status": "ok",
  "timestamp": "2026-03-23T12:00:00.000Z"
}
```

### 身份解析

```bash
POST /api/identity/resolve

# 请求
{
  "requestId": "req-001",
  "pageType": "lark_a1",
  "detected": {
    "larkId": "ou_xxx"
  }
}

# 响应
{
  "ok": true,
  "requestId": "req-001",
  "data": {
    "operatorLarkId": "ou_xxx",
    "mappingStatus": "unbound"
  }
}
```

### Meegle 认证 - 交换 Auth Code

```bash
POST /api/meegle/auth/exchange

# 请求
{
  "requestId": "req-002",
  "operatorLarkId": "ou_xxx",
  "meegleUserKey": "user_xxx",
  "baseUrl": "https://project.larksuite.com",
  "authCode": "abc123",
  "state": "state-001"
}

# 响应
{
  "ok": true,
  "requestId": "req-002",
  "data": {
    "tokenStatus": "ready",
    "credentialStatus": "active",
    "expiresAt": "2026-03-23T14:00:00.000Z"
  }
}
```

### Meegle 认证 - 查询状态

```bash
POST /api/meegle/auth/status

# 请求
{
  "requestId": "req-003",
  "operatorLarkId": "ou_xxx",
  "baseUrl": "https://project.larksuite.com"
}

# 响应
{
  "ok": true,
  "data": {
    "tokenStatus": "ready"
  }
}
```

### A1 工单分析

```bash
POST /api/a1/analyze

# 请求
{
  "requestId": "req-004",
  "operatorLarkId": "ou_xxx",
  "recordId": "recA1_001",
  "pageContext": {
    "pageType": "lark_a1",
    "baseId": "app_xxx",
    "tableId": "tbl_A1"
  }
}

# 响应
{
  "ok": true,
  "data": {
    "summary": "该工单更适合进入产线 Bug 流程",
    "decision": "to_b2",
    "missingFields": [],
    "riskLevel": "medium",
    "nextActions": ["补充环境信息", "生成 B2 草稿"]
  }
}
```

### A1 创建 B2 草稿

```bash
POST /api/a1/create-b2-draft

# 请求
{
  "requestId": "req-005",
  "operatorLarkId": "ou_xxx",
  "recordId": "recA1_001"
}

# 响应
{
  "ok": true,
  "data": {
    "draftId": "draft_b2_recA1_001",
    "target": {
      "projectKey": "OPS",
      "workitemTypeKey": "bug"
    },
    "draft": {
      "name": "支付页白屏",
      "fieldValuePairs": [
        {"fieldKey": "priority", "fieldValue": "P1"},
        {"fieldKey": "environment", "fieldValue": "production"}
      ]
    },
    "needConfirm": true
  }
}
```

### A1 应用 B2

```bash
POST /api/a1/apply-b2

# 请求
{
  "requestId": "req-006",
  "draftId": "draft_b2_recA1_001",
  "operatorLarkId": "ou_xxx",
  "sourceRecordId": "recA1_001",
  "idempotencyKey": "idem_001",
  "confirmedDraft": {
    "name": "支付页白屏",
    "fieldValuePairs": [...]
  }
}

# 响应
{
  "ok": true,
  "data": {
    "status": "created",
    "workitemId": "B2-001"
  }
}
```

### A2 相关接口

与 A1 接口对称：

- `POST /api/a2/analyze` - 分析 A2 需求
- `POST /api/a2/create-b1-draft` - 生成 B1 草稿
- `POST /api/a2/apply-b1` - 应用 B1

### PM 即时分析

```bash
POST /api/pm/analysis/run

# 请求
{
  "requestId": "req-007",
  "operatorLarkId": "ou_xxx",
  "scope": {
    "projectKeys": ["PROJ1"],
    "timeRange": {
      "from": "2026-03-01",
      "to": "2026-03-20"
    }
  }
}

# 响应
{
  "ok": true,
  "data": {
    "summary": "本周期有 3 个事项阻塞超过 5 天",
    "blockers": [...],
    "staleItems": [...],
    "suggestedActions": [...]
  }
}
```

## 错误码

| 错误码 | 描述 |
|--------|------|
| `IDENTITY_NOT_BOUND` | 用户身份未绑定 |
| `MEEGLE_AUTH_REQUIRED` | 需要 Meegle 认证 |
| `MEEGLE_NOT_LOGGED_IN` | Meegle 未登录 |
| `MEEGLE_AUTH_CODE_EXPIRED` | Auth code 已过期 |
| `MEEGLE_TOKEN_REFRESH_FAILED` | Token 刷新失败 |
| `MEEGLE_META_MISSING` | Meegle 元数据缺失 |
| `MEEGLE_CREATE_FAILED` | Meegle 创建失败 |
| `A1_RECORD_NOT_FOUND` | A1 记录不存在 |
| `A2_RECORD_NOT_FOUND` | A2 记录不存在 |
| `SCHEMA_VALIDATION_FAILED` | Schema 校验失败 |
| `PARTIAL_DATA_UNAVAILABLE` | 部分数据不可用 |

## 目录结构

```
server/
├── src/
│   ├── adapters/
│   │   └── meegle/
│   │       ├── auth-adapter.ts
│   │       └── token-store.ts
│   ├── application/
│   │   └── services/
│   │       ├── a1-workflow.service.ts
│   │       ├── a2-workflow.service.ts
│   │       ├── pm-analysis.service.ts
│   │       ├── meegle-credential.service.ts
│   │       └── identity-resolution.service.ts
│   ├── modules/
│   │   ├── identity/
│   │   │   ├── identity.controller.ts
│   │   │   └── identity.dto.ts
│   │   ├── meegle-auth/
│   │   │   ├── meegle-auth.controller.ts
│   │   │   ├── meegle-auth.service.ts
│   │   │   └── meegle-auth.dto.ts
│   │   ├── a1/
│   │   │   ├── a1.controller.ts
│   │   │   └── a1.dto.ts
│   │   ├── a2/
│   │   │   ├── a2.controller.ts
│   │   │   └── a2.dto.ts
│   │   └── pm-analysis/
│   │       ├── pm-analysis.controller.ts
│   │       └── pm-analysis.dto.ts
│   └── validators/
│       └── agent-output/
│           └── execution-draft.ts
├── tests/
│   ├── a1-workflow.service.test.ts
│   ├── a2-workflow.service.test.ts
│   ├── meegle-auth.service.test.ts
│   └── e2e/
│       ├── a1-to-b2.test.ts
│       └── a2-to-b1.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## 架构设计

### 分层架构

```
┌─────────────────────────────────────────┐
│  Browser Extension (extension/)         │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  API Gateway / Controllers              │
│  - /api/identity/resolve                │
│  - /api/meegle/auth/*                   │
│  - /api/a1/*                            │
│  - /api/a2/*                            │
│  - /api/pm/*                            │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Application Services                   │
│  - IdentityResolutionService            │
│  - MeegleCredentialService              │
│  - A1WorkflowService                    │
│  - A2WorkflowService                    │
│  - PMAnalysisService                    │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Domain Layer (Agents / Skills)         │
│  - A1IntakeAgent                        │
│  - A2RequirementAgent                   │
│  - PMAnalysisAgent                      │
│  - Skills: classification, enrichment   │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Platform Adapters                      │
│  - Lark Adapter (TODO)                  │
│  - Meegle Adapter (TODO)                │
│  - GitHub Adapter (TODO)                │
└─────────────────────────────────────────┘
```

## 当前状态

### 已实现

- [x] 项目脚手架和 TypeScript 配置
- [x] 身份解析模块（内存存储）
- [x] Meegle 认证模块（内存存储）
- [x] A1 工单分析服务（mock 数据）
- [x] A2 需求分析服务（框架）
- [x] PM 分析服务（框架）
- [x] Agent 输出校验器
- [x] 单元测试和 E2E 测试框架

### 待实现

- [ ] 数据库持久化存储
- [ ] AI Agent 实现（Anthropic Claude API）
- [ ] GitHub API 集成
- [ ] 审计日志和幂等性检查

## 配置

### 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `PORT` | 3000 | 服务端端口 |
| `SERVER_BASE_URL` | http://localhost:3000 | 服务端基础 URL |
| `MEEGLE_PLUGIN_ID` | - | Meegle 插件 ID |
| `MEEGLE_PLUGIN_SECRET` | - | Meegle 插件密钥 |
| `LARK_ACCESS_TOKEN` | - | Lark 用户访问令牌 |
| `ANTHROPIC_API_KEY` | - | Anthropic API 密钥 |

### 配置文件

- `tsconfig.json` - TypeScript 配置
- `package.json` - 依赖和脚本

## 测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npx vitest run tests/a1-workflow.service.test.ts

# 监听模式
npx vitest watch
```

### 测试覆盖

当前测试覆盖：

- A1 工作流服务
- A2 工作流服务
- Meegle 认证服务
- A1/A2 Controller
- E2E 流程测试（mock）

## 与 Extension 集成

扩展通过 HTTP 与服务端通信。确保：

1. 服务端已启动并运行
2. 扩展的 `SERVER_URL` 配置正确
3. CORS 配置允许扩展访问（开发模式）

## 下一步计划

1. **数据库持久化** - 替换内存存储
2. **AI Agent 实现** - 集成 Anthropic Claude API
3. **GitHub API 集成** - 读取 PR 和 issue 数据
4. **审计日志和幂等性检查** - 防止重复创建
5. **完善错误处理** - 超时、重试、降级
