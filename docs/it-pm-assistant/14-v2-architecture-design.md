# V2 Agent Platform 架构设计

**Generated:** 2026-03-23
**Branch:** feat/extension
**Status:** DRAFT

## 1. 设计目标

在 Phase 1（A1→B2 半自动建单）基础上，构建可扩展的 Agent 平台，支持：
- 多 Agent 协作（A1/A2/PM Analysis）
- 可配置的 Think Effort 模式
- Skills 系统（服务端预制 + 按页面配置）
- Context & Session Management
- 思考过程可见

## 2. 核心设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Think Effort | 用户可配置 (quick/standard/deep) | 用户根据任务复杂度选择，平衡时间/质量 |
| Skills 配置 | URL Pattern → Skills 映射 | 不同页面自动启用对应 Skills，无需手动配置 |
| Session 管理 | URL Prefix 绑定 + 手动选择 | 自动恢复上下文，同时支持用户手动切换 |
| Agent 输出 | SSE 流式 + 思考过程可见 | 建立信任，用户可实时看到分析进度 |
| 上下文管理 | 分层设计（Page/User/History） | 支持多场景、多页面的上下文隔离 |

## 3. 类型定义

### 3.1 PageType 枚举

```typescript
type PageType =
  | 'lark_a1'      // Lark 工单页面
  | 'lark_a2'      // Lark 需求池页面
  | 'meegle_project'  // Meegle 项目页面
  | 'meegle_workitem' // Meegle 工作项页面
  | 'github_repo'     // GitHub 仓库页面
  | 'github_pr'       // GitHub PR 页面
  | 'unknown';        // 未知页面类型
```

### 3.2 SkillRef 类型

```typescript
// Skill 引用（服务端配置用）
interface SkillRef {
  skillId: string;
  version: string;
  config?: object;
  enabled?: boolean;
}

// Skill 配置项（客户端 UI 用）
interface SkillConfigItem {
  skillId: string;
  displayName: string;
  description: string;
  config?: object;
}
```

### 3.3 Think Effort 语义定义

```typescript
// Skills 执行模式语义
type SkillsMode =
  | 'single'   // 单技能执行（quick 模式）
  | 'combo'    // 多技能并行执行（standard 模式）
  | 'chain'    // 技能链串行执行（deep 模式）

// Context Window 语义
type ContextWindowSize =
  | 'minimal'  // 仅当前页面核心数据（<1K tokens）
  | 'recent'   // 最近 3 次分析历史（<10K tokens）
  | 'full';    // 完整 Session 历史（无限制）
```

### 3.4 Context Collectors

```typescript
// 上下文采集器接口
interface ContextCollector {
  collectorId: string;
  description: string;
  handler: (page: Page) => Promise<object>;
}

// 预置采集器
const builtinCollectors: Record<string, ContextCollector> = {
  'record-fields': {
    collectorId: 'record-fields',
    description: '采集记录表单字段数据',
    handler: async (page) => { /* 实现 */ }
  },
  'record-comments': {
    collectorId: 'record-comments',
    description: '采集记录评论数据',
    handler: async (page) => { /* 实现 */ }
  },
  'page-snapshot': {
    collectorId: 'page-snapshot',
    description: '采集页面 DOM 快照（压缩后）',
    handler: async (page) => { /* 实现 */ }
  }
};
```

## 4. 服务端架构

### 4.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                              │
│  - REST / SSE Endpoints                                         │
│  - Session 路由                                                  │
│  - 认证与限流                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Orchestrator                          │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ A1 Intake   │  │ A2 Require  │  │ PM Analysis │             │
│  │ Agent       │  │ Agent       │  │ Agent       │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Agent 公共能力                          │   │
│  │  - Think Effort Controller (quick/standard/deep)        │   │
│  │  - Context Manager                                       │   │
│  │  - Skill Executor                                        │   │
│  │  - Output Streamer (SSE)                                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Skill Registry                             │
│                                                                 │
│  Skill 定义：                                                   │
│  - skillId: string                                             │
│  - version: string                                             │
│  - handler: (context, config) => result                        │
│  - configSchema: JSON Schema                                   │
│                                                                 │
│  URL → Skill 映射：                                              │
│  - urlPattern: string (支持通配符)                              │
│  - pageType: string                                            │
│  - skills: SkillRef[]                                          │
│                                                                 │
│  内置 Skills:                                                   │
│  - A1: ticket-classification, missing-info-detection, ...      │
│  - A2: requirement-structuring, gap-analysis, ...              │
│  - PM: blocker-detection, stale-item-detection, ...            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Context Management                           │
│                                                                 │
│  Session Schema:                                                │
│  {                                                              │
│    sessionId: string                                            │
│    userId: string                                               │
│    urlPrefix: string                                            │
│    skills: SkillRef[]                                           │
│    context: { page, user, history }                             │
│    createdAt/updatedAt: timestamp                               │
│  }                                                              │
│                                                                 │
│  Context 类型：                                                  │
│  - Page Context: 页面内容、表单数据、选中项                       │
│  - User Context: 用户配置、偏好设置                              │
│  - History Context: 历史对话、分析结果                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Platform Adapters                             │
│  - Lark API (A1/A2 数据拉取)                                       │
│  - Meegle API (工作项创建/查询)                                  │
│  - GitHub API (PR 状态读取)                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Think Effort 模式

```typescript
interface ThinkEffortProfile {
  quick: {
    maxDurationMs: 60 * 1000,         // 1 分钟硬限制
    maxLlmCalls: 2,                    // 最多 2 次 LLM 调用
    maxTokens: 4000,                   // 最多 4K tokens
    skills: 'single',                  // 单技能
    contextWindow: 'minimal'           // 最小上下文
  },
  standard: {
    maxDurationMs: 3 * 60 * 1000,     // 3 分钟硬限制
    maxLlmCalls: 5,                    // 最多 5 次 LLM 调用
    maxTokens: 16000,                  // 最多 16K tokens
    skills: 'combo',                   // 多技能组合
    contextWindow: 'recent'            // 包含最近历史
  },
  deep: {
    maxDurationMs: 10 * 60 * 1000,    // 10 分钟硬限制
    maxLlmCalls: 20,                   // 最多 20 次 LLM 调用 (原'unlimited'改为有限制)
    maxTokens: 100000,                 // 最多 100K tokens
    skills: 'chain',                   // 完整技能链
    contextWindow: 'full',             // 完整上下文
    reflection: true                   // 包含验证反思
  }
}
```

**资源限制说明:**
- `maxDurationMs`: 硬限制，超时强制终止
- `maxLlmCalls`: 防止无限循环调用
- `maxTokens`: 控制 token 消耗成本
- `reflection`: deep 模式特有，执行完成后额外调用 LLM 验证结果质量
- 所有限制在配置文件中可调整

**Reflection 机制 (deep 模式):**
- 在技能链执行完成后触发
- LLM 反思问题：
  - "分析结果是否完整回答了用户问题？"
  - "是否遗漏了重要信息？"
  - "是否有更优的分析路径？"
- 反思结果追加到 `thinkingLog`，不改变已执行技能结果
- 用于持续改进 Skill 质量和用户信任建立

### 4.3 SSE 输出协议

**事件格式:**

```typescript
// 所有事件的公共字段
interface SseEvent {
  eventId: string;       // 递增序列号，用于重连
  sessionId: string;     // Session ID，用于恢复
  timestamp: string;     // ISO 8601 时间戳
}

// 思考阶段开始
event: thinking-start
data: {
  phase: "understanding" | "analyzing" | "executing" | "synthesizing",
  message: string,
  ...SseEvent
}

// 思考阶段更新
event: thinking-update
data: {
  phase: string,
  message: string,
  progress: number,  // 0-100
  ...SseEvent
}

// 技能执行开始
event: skill-execution
data: {
  skillId: string,
  skillName: string,
  status: "running",
  ...SseEvent
}

// 技能执行完成
event: skill-result
data: {
  skillId: string,
  result: object,
  duration: number,
  ...SseEvent
}

// 最终结果
event: final-result
data: {
  summary: string,
  decision?: string,
  missingFields?: string[],
  riskLevel?: "low" | "medium" | "high",
  nextActions?: string[],
  bugDraft?: object,
  ...SseEvent
}

// 错误
event: error
data: {
  errorCode: string,
  errorMessage: string,
  recoverable: boolean,
  retryAfter?: number,  // 建议重试时间 (秒)
  ...SseEvent
}
```

**重连协议:**

1. 客户端发送请求时设置 `Last-Event-ID` 头部
2. 服务端从 `Last-Event-ID` 位置继续发送事件
3. 事件保留 5 分钟，超时清除
4. 客户端重连间隔：1s, 2s, 4s, 8s, 16s (指数退避，最大 16s)
5. 重连失败超过 5 次，显示错误提示用户手动重试

**SSE 事件存储策略:**

```typescript
// 服务端事件存储接口
interface SseEventStore {
  // 存储事件（按 sessionId 分组）
  store(sessionId: string, event: SseEvent): Promise<void>;

  // 从 eventId 开始检索事件
  getFrom(sessionId: string, eventId: number): Promise<SseEvent[]>;

  // 清理过期事件（定时任务）
  cleanupExpired(): Promise<number>;
}

// Redis Stream 实现
class RedisSseEventStore implements SseEventStore {
  // 使用 Redis Stream 存储事件
  // Key 格式：sse:events:{sessionId}
  // 保留时间：5 分钟（通过 Redis TTL 实现）

  async store(sessionId: string, event: SseEvent): Promise<void> {
    await redis.xadd(`sse:events:${sessionId}`, '*', 'data', JSON.stringify(event));
    await redis.expire(`sse:events:${sessionId}`, 300);
  }

  async getFrom(sessionId: string, eventId: number): Promise<SseEvent[]> {
    const events = await redis.xread(`sse:events:${sessionId}`, eventId);
    return events.map(e => JSON.parse(e.data));
  }
}
```

**网络断线恢复策略:**

| 场景 | 恢复策略 |
|------|---------|
| 短连接断开（<5 秒） | 自动重连，从 Last-Event-ID 恢复 |
| 分析中断（<5 分钟） | 重连后继续接收事件 |
| 分析超时/失败 | 返回 error 事件，提示用户重新分析 |
| 服务端重启 | 事件丢失，返回 503 错误，客户端提示重试 |

**Token 预算超限降级策略:**

- `quick` 模式：达到 4K tokens 时，截断当前 LLM 调用，返回部分结果
- `standard` 模式：达到 16K tokens 时，跳过非关键 skills，优先保证核心分析
- `deep` 模式：达到 100K tokens 时，提前触发 reflection，输出当前最佳结果

## 5. 客户端架构

### 5.1 扩展结构

```
extension/
├── src/
│   ├── types/
│   │   ├── protocol.ts      # 通信协议
│   │   ├── context.ts       # 上下文类型
│   │   ├── session.ts       # Session 类型
│   │   └── skills.ts        # Skills 类型
│   │
│   ├── content-scripts/
│   │   ├── lark.ts          # Lark 页面脚本
│   │   └── meegle.ts        # Meegle 页面脚本
│   │
│   ├── page-bridge/
│   │   └── auth-bridge.ts   # 认证桥接
│   │
│   ├── background/
│   │   ├── router.ts        # 消息路由
│   │   ├── session-manager.ts # Session 管理
│   │   ├── skill-loader.ts  # Skills 加载
│   │   └── handlers/
│   │       ├── identity.ts
│   │       ├── meegle-auth.ts
│   │       ├── a1.ts
│   │       ├── a2.ts
│   │       └── pm-analysis.ts
│   │
│   └── popup/
│       ├── popup.html       # Popup 界面
│       ├── popup.ts         # Popup 逻辑
│       └── components/
│           ├── SessionSelector.ts
│           ├── SkillList.ts
│           ├── EffortSelector.ts
│           └── AnalysisResult.ts
```

### 5.2 Session 管理流程

```
1. 用户访问 URL
       │
       ▼
2. Content Script 检测 URL
       │
       ▼
3. Background 匹配 URL Prefix
       │
       ├──────┐
       │      │
       ▼      ▼
   找到 Session  未找到
       │           │
       ▼           ▼
   恢复上下文   创建新 Session
       │           │
       ▼           ▼
4. 显示 Popup    显示"开始分析"
```

### 5.3 Skill 加载流程

```
1. Popup 打开
       │
       ▼
2. 读取当前 URL
       │
       ▼
3. 请求服务端 /api/skills/config?url=xxx
       │
       ▼
4. 服务端返回匹配的技能列表
       │
       ▼
5. 客户端加载技能处理器
       │
       ▼
6. 渲染 SkillList UI（显示可用技能）
```

## 6. URL → Skills 映射配置

### 6.1 配置 Schema

```typescript
interface SkillConfig {
  urlPattern: string;       // URL 通配符模式
  urlPrefix: string;        // 用于 Session 绑定的前缀
  pageType: PageType;       // 页面类型标识

  skills: Array<{
    skillId: string;
    displayName: string;
    description: string;
    config?: object;
  }>;

  contextCollectors: string[];  // 上下文采集器列表
  defaultEffort: 'quick' | 'standard' | 'deep';
}
```

### 6.2 预置配置示例

```typescript
// Lark A1 页面
{
  urlPattern: "https://*.lark.cn/bases/:baseId/tables/:tableId",
  urlPrefix: "lark_a1",
  pageType: "lark_a1",

  skills: [
    {
      skillId: "ticket-classification",
      displayName: "工单分类",
      description: "自动识别工单类型并分类"
    },
    {
      skillId: "missing-info-detection",
      displayName: "缺失信息检测",
      description: "识别工单中缺失的关键信息"
    },
    {
      skillId: "bug-draft-enrichment",
      displayName: "Bug 草稿补全",
      description: "自动生成 Bug 报告草稿"
    }
  ],

  contextCollectors: ["record-fields", "record-comments"],
  defaultEffort: "standard"
}

// Lark A2 页面
{
  urlPattern: "https://*.lark.cn/bases/:baseId/tables/:tableId",  // 与 A1 共享 URL 模式，通过 pageType 区分
  urlPrefix: "lark_a2",
  pageType: "lark_a2",

  skills: [
    {
      skillId: "requirement-structuring",
      displayName: "需求结构化",
      description: "将原始需求整理为结构化格式"
    },
    {
      skillId: "gap-analysis",
      displayName: "缺口分析",
      description: "识别需求中的信息缺口"
    },
    {
      skillId: "dev-brief-generation",
      displayName: "研发简报生成",
      description: "生成研发可执行的简报"
    }
  ],

  contextCollectors: ["record-fields", "record-comments"],
  defaultEffort: "standard"
}

// Meegle 项目页面
{
  urlPattern: "https://*.meegle.com/projects/:projectKey/*",
  urlPrefix: "meegle_project",
  pageType: "meegle_project",

  skills: [
    {
      skillId: "project-status-analysis",
      displayName: "项目状态分析",
      description: "分析项目整体状态"
    },
    {
      skillId: "blocker-detection",
      displayName: "阻塞项检测",
      description: "识别项目阻塞风险"
    },
    {
      skillId: "sprint-planning",
      displayName: "Sprint 规划",
      description: "协助 Sprint 规划"
    }
  ],

  contextCollectors: ["workitem-list", "project-members"],
  defaultEffort: "standard"
}
```

## 7. Popup UI 设计

### 7.1 主界面布局

```
┌────────────────────────────────────────────────────────────┐
│  Octo Assistant                              [?] [⚙️]       │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  📍 当前页面：Lark A1 工单                                    │
│  🔗 lark.example.com/bases/app123/tables/tbl456            │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Session: [项目 A 工单分析 ▼]    [+ 新建]                    │
│                                                            │
│  上次分析：2 小时前 - "工单#123 分类为 B2 Bug"                  │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  可用 Skills:                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │ ✅ 工单分类      - 自动识别工单类型并分类              │   │
│  │ ✅ 缺失信息检测   - 识别工单中缺失的关键信息            │   │
│  │ ✅ Bug 草稿补全   - 自动生成 Bug 报告草稿              │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  思考深度：⚪ quick  ● standard  ⚪ deep                     │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│                  [🚀 开始分析]                              │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  最近结果：                                                 │
│  ┌────────────────────────────────────────────────────┐   │
│  │ ▼ 2026-03-23 14:30 - standard                      │   │
│  │   决策：转为 B2 Bug                                  │   │
│  │   风险：中                                          │   │
│  │   [查看] [重新分析]                                 │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 7.2 分析中界面

```
┌────────────────────────────────────────────────────────────┐
│  分析中...                                   [停止]         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  思考过程：                                                 │
│                                                            │
│  ▼ 理解问题 (0:05)                                         │
│    正在读取工单标题和描述...                                 │
│                                                            │
│  ▼ 分析页面内容 (0:12)                                     │
│    检测到 3 个必填字段已填写                                 │
│    检测到 2 个必填字段缺失...                                │
│                                                            │
│  ▼ 执行技能：工单分类 (0:18)                                │
│    分类结果：Bug (置信度 0.85)                              │
│                                                            │
│  ▼ 执行技能：缺失信息检测 (0:25)                            │
│    完整度：62.5%                                           │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  分析完成！                                                 │
│                                                            │
│  摘要：建议将此工单转为 Meegle B2 Bug                        │
│  风险：🟡 中                                                │
│                                                            │
│  [查看完整报告]  [生成 B2 草稿]  [重新分析]                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## 8. API 端点设计

### 8.1 服务端 API

```
GET  /health
GET  /api/skills/config?url=...

POST /api/identity/resolve
POST /api/meegle/auth/exchange
POST /api/meegle/auth/status

POST /api/a1/analyze           (SSE)
POST /api/a1/create-b2-draft
POST /api/a1/apply-b2

POST /api/a2/analyze           (SSE)
POST /api/a2/create-b1-draft
POST /api/a2/apply-b1

POST /api/pm/analysis/run      (SSE)

POST /api/sessions/create
GET  /api/sessions/:id
GET  /api/sessions?prefix=...
DELETE /api/sessions/:id
```

### 8.2 SSE Endpoint 示例

```bash
# 发起分析请求
curl -N POST http://localhost:3000/api/a1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "sess_abc123",
    "effort": "standard",
    "context": {...}
  }'

# 响应流:
# event: thinking-start
# data: {"phase":"understanding","message":"正在理解问题..."}
#
# event: skill-execution
# data: {"skillId":"ticket-classification","status":"running"}
#
# event: skill-result
# data: {"skillId":"ticket-classification","result":{...}}
#
# event: final-result
# data: {"summary":"...","decision":"to_b2",...}
```

## 9. 数据 Schema

### 9.1 Session Schema

```typescript
interface Session {
  sessionId: string;
  userId: string;
  urlPrefix: string;
  pageType: PageType;

  // 绑定的 Skills
  skills: SkillRef[];  // 使用 3.2 节定义的 SkillRef 类型

  // 上下文数据
  context: {
    page?: PageContext;
    user?: UserContext;
    lastRecordId?: string;
    pageSnapshot?: object;    // 大小限制：< 100KB（压缩后）
  };

  // 历史对话
  history: Array<{
    timestamp: string;  // ISO 8601
    effort: 'quick' | 'standard' | 'deep';
    input: object;
    output: object;
    thinkingLog: Array<{
      phase: string;
      message: string;
      timestamp: string;  // ISO 8601
    }>;
  }>;

  // Session 生命周期
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  lastAccessedAt: string;  // ISO 8601 - 用于 TTL 计算
}

// Session 过期策略
interface SessionTTL {
  ttlMs: number;           // 默认 7 天
  maxHistoryEntries: number;  // 最多保留 50 条历史记录
  maxHistoryBytes: number;    // 历史总大小限制 1MB
}

const defaultSessionTTL: SessionTTL = {
  ttlMs: 7 * 24 * 60 * 60 * 1000,     // 7 天
  maxHistoryEntries: 50,               // 最多 50 条
  maxHistoryBytes: 1024 * 1024         // 1MB
};
```

### 9.2 Session 生命周期管理

```typescript
// Session 状态
type SessionState = 'active' | 'idle' | 'expired';

// Session 管理器接口
interface SessionManager {
  // 创建 Session
  create(urlPrefix: string, pageType: PageType): Promise<Session>;

  // 恢复 Session（通过 sessionId）
  restore(sessionId: string): Promise<Session | null>;

  // 按 URL Prefix 查找 Sessions
  findByPrefix(userId: string, urlPrefix: string): Promise<Session[]>;

  // 更新 Session（touch）
  touch(sessionId: string): Promise<void>;

  // 删除 Session
  delete(sessionId: string): Promise<void>;

  // 清理过期 Sessions（定时任务）
  cleanupExpired(): Promise<number>;  // 返回清理数量
}
```

**TTL 策略:**
- Session 默认 7 天过期（从 `lastAccessedAt` 计算）
- 每次访问自动续期（滑动窗口）
- 历史记录超过 50 条或 1MB 时，删除最旧的记录
- 过期 Session 标记为 `expired`，7 天后物理删除

### 9.3 多 Tab Session 冲突解决

**场景:** 用户在同一 URL Prefix 打开多个 Tab

**策略:**
1. **写入互斥**: 同一 Session 同时只允许一个写入请求
   - 使用乐观锁 (`updatedAt` 版本号)
   - 冲突时拒绝旧版本写入，返回 409 Conflict

2. **读并发**: 允许多个 Tab 同时读取

3. **最后写入优先**:
   - Tab A 和 Tab B 同时分析
   - 后完成的 Tab 覆盖 Session 的 `context.lastAnalysis`
   - 每个 Tab 保留自己的分析结果 ID，用户可回溯

4. **Tab 关闭检测**:
   - 客户端在 Tab 关闭前发送 `beforeunload` 通知
   - 服务端标记该 Tab 的 Session 引用为 `detached`
   - 不立即删除 Session，等待 TTL 过期

```typescript
// 多 Tab 冲突处理
interface TabSession {
  sessionId: string;
  tabId: string;       // 客户端 Tab ID
  createdAt: string;
  lastHeartbeat: string;  // 心跳时间
}

// 冲突响应
interface ConflictResponse {
  errorCode: 'SESSION_CONFLICT';
  message: string;
  conflictingTabId: string;
  suggestion: 'retry' | 'create_new_session';
}
```

### 9.4 Analysis Request/Response

```typescript
interface AnalysisRequest {
  sessionId: string;
  effort: 'quick' | 'standard' | 'deep';
  context: {
    pageType: string;
    recordId?: string;
    pageContent?: object;
  };
}

interface AnalysisResponse {
  summary: string;
  decision?: 'direct_handle' | 'to_b2' | 'to_a2';
  missingFields?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
  nextActions?: string[];
  bugDraft?: {
    name: string;
    templateId?: number;
    fieldValuePairs: Array<{
      fieldKey: string;
      fieldValue: string | number | boolean;
    }>;
  };
}
```

## 10. Skill Registry 详细设计

### 10.1 Skill 定义

```typescript
// Skill 类型
type SkillType = 'analysis' | 'action';

// Skill 定义
interface Skill {
  skillId: string;
  version: string;
  type: SkillType;

  // 输入 Schema
  inputSchema: JSONSchema;

  // 执行器
  handler: (context: Context, config?: object) => Promise<SkillResult>;
}

// 执行结果
interface SkillResult {
  status: 'success' | 'error' | 'requires_confirmation';
  data: object;                    // 业务数据
  sideEffect?: SideEffect;         // 可选的副作用
  error?: string;
}

// 副作用定义
interface SideEffect {
  type: 'create_workitem' | 'update_workitem' | 'create_comment';
  description: string;             // 用户可见的描述
  payload: object;                 // 执行所需数据
}
```

### 10.2 Skill 执行流程

```
1. Agent 接收用户请求
       │
       ▼
2. 根据 URL 从 Skill Registry 获取配置
       │
       ▼
3. 构建统一 Context（页面数据 + 用户数据 + 历史数据）
       │
       ▼
4. 执行 Analysis Skills（只读分析）
       │
       ▼
5. 如果有 Action Skill 返回 sideEffect
       │
       ▼
6. Agent 汇总 sideEffects，询问用户确认
       │
       ▼
7. 用户确认后，执行 Side Effects
```

### 10.3 URL → Skills 映射配置

使用第 5.1 节定义的 `SkillConfig` 接口。

**服务端 API:**

```
GET /api/skills/config?url=...  → SkillConfig[]
```

**匹配逻辑:**
1. 客户端发送当前 URL
2. 服务端遍历 SkillConfig 列表，使用 urlPattern 匹配
3. 返回第一个匹配的 SkillConfig
4. 无匹配返回 404

**Lark A1 页面配置示例:**
```
{
  urlPrefix: "lark_a1",
  urlPattern: "https://*.lark.cn/bases/:baseId/tables/:tableId",
  pageType: "lark_a1",
  skills: [
    { skillId: "ticket-classification", version: "1.0", enabled: true },
    { skillId: "missing-info-detection", version: "1.0", enabled: true },
    { skillId: "bug-draft-enrichment", version: "1.0", enabled: true }
  ],
  defaultEffort: "standard"
}
```

**URL Pattern 语法:**
- 使用 `path-to-regexp` 库进行匹配
- 支持 `*` 通配符 (匹配任意字符)
- 支持 `:paramName` 参数捕获
- 区分大小写
- 不包含查询参数

### 10.4 Skill 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Skill 组合 | 单一执行 | 简单清晰，易于调试和追踪 |
| 配置存储 | 服务端集中管理 | 统一更新，便于版本控制 |
| 输入来源 | 统一 Context | Skill 解耦，不依赖具体数据源 |
| Side Effects | Analysis + Action 分离 | 清晰的职责边界，用户确认前不执行 |

## 11. Context Management 详细设计

### 11.1 Context 类型

```typescript
// 统一 Context 对象
interface Context {
  // 页面上下文（由客户端采集）
  page?: PageContext;

  // 用户上下文（由身份系统提供）
  user?: UserContext;

  // 历史上下文（从 Session 历史加载）
  history?: HistoryContext;
}

// 页面上下文
interface PageContext {
  pageType: string;
  url: string;
  recordId?: string;
  baseId?: string;
  tableId?: string;
  projectKey?: string;
  workitemId?: string;
  pageSnapshot?: object;    // 页面内容快照
}

// 用户上下文
interface UserContext {
  operatorLarkId: string;
  meegleUserKey?: string;
  githubId?: string;
  preferences?: object;
}

// 历史上下文
interface HistoryContext {
  lastAnalysis?: {
    timestamp: string;
    effort: string;
    result: object;
  };
  thinkingLogs?: Array<{
    phase: string;
    message: string;
    timestamp: string;
  }>;
}
```

### 11.2 Context 管理架构

```
┌──────────────────────────────────────────────────────────────┐
│                    Context Manager (服务端)                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Context Store                         │   │
│  │  - Session Context (PostgreSQL/Redis)                │   │
│  │  - Page Context (临时缓存)                            │   │
│  │  - History Context (归档存储)                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Context Builder                          │   │
│  │  - 从客户端接收页面上下文                             │   │
│  │  - 从身份系统加载用户上下文                           │   │
│  │  - 从 Session 存储加载历史上下文                       │   │
│  │  - 构建统一 Context 对象                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Context Provider                         │   │
│  │  - 向 Skills 提供统一的 Context 读取接口                 │   │
│  │  - 管理 Context 生命周期                               │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 11.3 Context 存储策略

**分层存储:**

| Context 类型 | 存储介质 | 保留时间 | 大小限制 |
|-------------|---------|---------|---------|
| Page Context | Redis（缓存） | 24 小时 | 单条 < 100KB |
| User Context | PostgreSQL | 永久 | - |
| History Context | PostgreSQL + 归档 | 按 Session TTL | 单 Session < 1MB |
| pageSnapshot | Redis（压缩） | 1 小时 | < 100KB（压缩后） |

**pageSnapshot 压缩策略:**
- 仅存储关键 DOM 节点（表单、表格、评论）
- 移除样式和脚本节点
- 使用 gzip 压缩
- 超过 100KB 截断

### 11.4 Context Builder 实现

```typescript
interface ContextBuilder {
  // 构建完整 Context
  build(sessionId: string, effort: ThinkEffortMode): Promise<Context>;

  // 根据 effort 级别裁剪上下文
  trimByEffort(context: Context, effort: ThinkEffortMode): Context;
}

// ContextWindow 语义实现
function getContextWindowLimit(effort: ThinkEffortMode): ContextWindowSize {
  switch (effort) {
    case 'quick':
      return { size: 'minimal', maxHistoryEntries: 0 };
    case 'standard':
      return { size: 'recent', maxHistoryEntries: 3 };
    case 'deep':
      return { size: 'full', maxHistoryEntries: Infinity };
  }
}
```

### 10.5 Context 设计决策

| 决策点 | 选择 | 理由 |
|------|------|------|
| Context 存储位置 | 服务端 | 支持多设备同步，Session 恢复 |
| Context 构建 | 服务端负责 | 统一数据源，减少客户端负担 |
| Context 传递 | 统一对象 | Skill 解耦，不依赖具体数据源 |
| 历史归档 | 服务端 | 长期存储，支持回溯分析 |
| pageSnapshot | 选择性压缩存储 | 控制存储成本，保留关键信息 |

## 12. 错误处理策略

### 12.1 错误分类

| 错误码 | 类型 | 说明 | 处理策略 |
|--------|------|------|----------|
| `SKILL_TIMEOUT` | timeout | Skill 执行超时 | 指数退避重试，最大 3 次 |
| `LLM_RATE_LIMIT` | retryable | LLM API 限流 | 等待 retry-after 后重试 |
| `ADAPTER_UNAVAILABLE` | circuit_open | 外部服务不可用 | 断路器打开，降级处理 |
| `CONTEXT_NOT_FOUND` | non_retryable | 上下文未找到 | 返回 404，提示重新分析 |
| `SESSION_EXPIRED` | non_retryable | Session 过期 | 返回 401，提示重新认证 |
| `VALIDATION_FAILED` | non_retryable | 参数校验失败 | 返回 400，显示具体错误 |
| `INTERNAL_ERROR` | retryable | 内部错误 | 重试 2 次后转人工 |

### 12.2 重试策略

```typescript
interface RetryConfig {
  maxRetries: number;        // 最大重试次数
  initialDelayMs: number;    // 初始延迟
  maxDelayMs: number;        // 最大延迟
  multiplier: number;        // 指数退避倍数
}

// 默认重试配置
const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 16000,
  multiplier: 2
};
```

### 12.3 断路器模式

```
外部服务 (Lark/Meegle/GitHub API) → 断路器 → 适配器

断路器状态:
- CLOSED (正常): 请求正常通过
- OPEN (打开): 拒绝所有请求，直接返回错误
- HALF_OPEN (半开): 允许一个探测请求

状态转换:
CLOSED → OPEN: 连续 5 次失败
OPEN → HALF_OPEN: 30 秒后
HALF_OPEN → CLOSED: 探测成功
HALF_OPEN → OPEN: 探测失败
```

### 12.4 部分失败处理

**场景:** 多技能执行时部分失败

**策略:**
1. 记录已执行技能结果
2. 跳过失败技能
3. 汇总部分结果返回
4. 标记不完整状态

## 13. 待补项和技术风险

### 13.1 Phase 1 遗留待补项

- [ ] A2 模块实现
- [ ] PM Analysis 模块实现
- [ ] 数据库持久化
- [ ] 真实 Lark/Meegle API 集成

### 13.2 V2 新增待补项

- [ ] Think Effort Controller 实现
- [ ] Skill Registry 实现
- [ ] Context Manager 实现
- [ ] SSE 输出流实现
- [ ] Session Manager（客户端 + 服务端）
- [ ] URL → Skills 映射配置系统
- [ ] Popup UI 实现
- [ ] 思考过程日志记录

### 13.3 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| SSE 长连接稳定性 | 中 | 实现心跳和重连机制（见 4.3 节） |
| Session 数据量增长 | 高 | 实现历史归档策略（见 9.1 节 Session TTL） |
| Skill 执行超时 | 高 | Effort Controller 强制限时（见 4.2 节） |
| 多 Tab Session 冲突 | 中 | Session 冲突解决策略（见 9.3 节） |
| Context 存储成本 | 中 | Context 压缩和清理策略（见 10.4 节） |

### 13.4 下一步计划

#### 13.4.1 优先级排序

1. **P0 - 基础架构**
   - Agent Orchestrator 重构
   - Skill Registry 设计
   - SSE 输出协议

2. **P1 - Session 管理**
   - Session Schema 定义
   - 客户端 Session Manager
   - 服务端 Session API

3. **P2 - Think Effort**
   - Effort Controller
   - 三级配置实现

4. **P3 - Skills 系统**
   - URL → Skills 映射
   - Skill Loader
   - 预置 Skills 配置

5. **P4 - UI 实现**
   - Popup 主界面
   - 分析结果展示
   - 思考过程渲染

#### 13.4.2 推荐实施顺序

```
Phase 2.1: 服务端架构升级
  - 重构 Agent Orchestrator
  - 实现 Skill Registry
  - 实现 SSE 输出

Phase 2.2: Session & Context
  - 实现 Session Manager
  - 实现 Context Manager
  - 客户端 Session 同步

Phase 2.3: Think Effort
  - 实现 Effort Controller
  - 配置 quick/standard/deep

Phase 2.4: Skills 配置系统
  - URL → Skills 映射
  - 预置 Skills 配置
  - 客户端 Skill Loader

Phase 2.5: UI 实现
  - Popup 重构
  - 分析结果展示
  - 思考过程可视化
```

---

**附录 A**: [Phase 1 设计文档](./04-architecture.md)
**附录 B**: [AI Agent / Skill 设计](./05-ai-agent-skill-design.md)
**附录 C**: [一期实施路线](./07-phase-1-rollout.md)
