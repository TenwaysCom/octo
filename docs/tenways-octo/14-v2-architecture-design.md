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

## 3. 服务端架构

### 3.1 整体架构图

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

### 3.2 Think Effort 模式

```typescript
interface ThinkEffortConfig {
  quick: {
    maxDurationMs: 60 * 1000,        // 1 分钟
    llmCalls: 1,                      // 单次调用
    skills: 'single',                 // 单技能
    contextWindow: 'minimal'          // 最小上下文
  },
  standard: {
    maxDurationMs: 3 * 60 * 1000,    // 3 分钟
    llmCalls: 2-3,                    // 2-3 轮对话
    skills: 'combo',                  // 多技能组合
    contextWindow: 'recent'           // 包含最近历史
  },
  deep: {
    maxDurationMs: 10 * 60 * 1000,   // 10 分钟
    llmCalls: 'unlimited',            // 多轮迭代
    skills: 'chain',                  // 完整技能链
    contextWindow: 'full',            // 完整上下文
    reflection: true                  // 包含验证反思
  }
}
```

### 3.3 SSE 输出协议

```typescript
// Server-Sent Events 流式输出

// 思考阶段开始
event: thinking-start
data: {
  phase: "understanding" | "analyzing" | "executing" | "synthesizing",
  message: string,
  timestamp: string
}

// 思考阶段更新
event: thinking-update
data: {
  phase: string,
  message: string,
  progress: number  // 0-100
}

// 技能执行开始
event: skill-execution
data: {
  skillId: string,
  skillName: string,
  status: "running"
}

// 技能执行完成
event: skill-result
data: {
  skillId: string,
  result: object,
  duration: number
}

// 最终结果
event: final-result
data: {
  summary: string,
  decision?: string,
  missingFields?: string[],
  riskLevel?: "low" | "medium" | "high",
  nextActions?: string[],
  bugDraft?: object  // 如果是 A1→B2
}

// 错误
event: error
data: {
  errorCode: string,
  errorMessage: string,
  recoverable: boolean
}
```

## 4. 客户端架构

### 4.1 扩展结构

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

### 4.2 Session 管理流程

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

### 4.3 Skill 加载流程

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

## 5. URL → Skills 映射配置

### 5.1 配置 Schema

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

### 5.2 预置配置示例

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
  ]
}

// Meegle 项目页面
{
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
  ]
}
```

## 6. Popup UI 设计

### 6.1 主界面布局

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

### 6.2 分析中界面

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

## 7. API 端点设计

### 7.1 服务端 API

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

### 7.2 SSE Endpoint 示例

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

## 8. 数据 Schema

### 8.1 Session Schema

```typescript
interface Session {
  sessionId: string;
  userId: string;
  urlPrefix: string;
  pageType: PageType;

  // 绑定的 Skills
  skills: Array<{
    skillId: string;
    version: string;
    config?: object;
  }>;

  // 上下文数据
  context: {
    page?: PageContext;
    user?: UserContext;
    lastRecordId?: string;
    pageSnapshot?: object;
  };

  // 历史对话
  history: Array<{
    timestamp: string;
    effort: 'quick' | 'standard' | 'deep';
    input: object;
    output: object;
    thinkingLog: Array<{
      phase: string;
      message: string;
      timestamp: string;
    }>;
  }>;

  createdAt: string;
  updatedAt: string;
}
```

### 8.2 Analysis Request/Response

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

## 9. 待补项

### Phase 1  deferred（从 Phase 1 延续）

- [ ] A2 模块实现
- [ ] PM Analysis 模块实现
- [ ] 数据库持久化
- [ ] 真实 Lark/Meegle API 集成

### V2 新增待补

- [ ] Think Effort Controller 实现
- [ ] Skill Registry 实现
- [ ] Context Manager 实现
- [ ] SSE 输出流实现
- [ ] Session Manager（客户端 + 服务端）
- [ ] URL → Skills 映射配置系统
- [ ] Popup UI 实现
- [ ] 思考过程日志记录

## 10. 下一步计划

### 10.1 优先级排序

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

### 10.2 推荐实施顺序

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

## 11. 风险与考量

### 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| SSE 长连接稳定性 | 中 | 实现心跳和重连机制 |
| Session 数据量增长 | 中 | 实现历史归档策略 |
| Skill 执行超时 | 高 | Effort Controller 强制限时 |

### 用户体验考量

- 思考过程展示不应过于冗长（避免信息过载）
- Effort 级别应有明确的时间和效果预期
- Session 切换应有确认，避免误操作丢失上下文

---

**附录 A**: [Phase 1 设计文档](./04-architecture.md)
**附录 B**: [AI Agent / Skill 设计](./05-ai-agent-skill-design.md)
**附录 C**: [一期实施路线](./07-phase-1-rollout.md)
