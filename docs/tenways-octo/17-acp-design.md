# ACP 设计

## 1. 文档目标

本文档集中描述 Tenways Octo 当前已经收敛下来的 ACP 设计，重点覆盖：

- ACP `V1` 的问题定义与范围
- 当前已批准的架构决策
- 扩展端与服务端的模块拆分
- ACP `V1` 的接口与事件模型
- session 持久化与 Redis 使用方式
- 从 `V1` 演进到通用 ACP 的路线

这是一份**当前落地设计文档**，不是对远期平台能力的空泛设想。

## 2. 设计定位

当前 ACP 的设计定位非常明确：

- `V1` 只做 `PM Analysis ACP Facade`
- 目标不是“先做一个通用 ACP 平台”
- 目标是把现有 PM 即时分析从“一次性固定结果”升级成：
  - 可会话
  - 可追问
  - 可流式返回
  - 可跨重启恢复 session

一句话总结：

> 先让 PM 分析变成一个可连续工作的分析线程，再考虑把这套能力推广到 A1/A2/CLI。

## 3. 问题定义

当前 Tenways Octo 已经有 `PM 即时分析` 能力，但它是一次性分析：

1. 用户提交项目范围
2. 服务端返回固定 summary / blockers / stale items
3. 用户如果想继续追问，就需要离开结果页，手动去 Lark / Meegle / GitHub 补查

因此当前问题不是“PM 分析没有价值”，而是：

- 它能回答“现在有什么问题”
- 但还不能回答“继续帮我把问题往下掰开”

ACP `V1` 的作用，就是给这个已有能力包上一层会话与流式交互壳。

## 4. 当前范围

### 4.1 In Scope

- `PM Analysis ACP Facade`
- 单个 `POST` 流式 chat 接口
- 首问创建 session
- follow-up 复用同一个 session
- rules-based follow-up
- `Managed Redis` session 持久化
- Popup 内最小聊天式交互面板

### 4.2 Not In Scope

- A1/A2 同时迁移到 ACP
- 通用 ACP gateway
- 通用 orchestrator / agent registry
- file upload
- diff 输出
- 多线程 session inbox
- session 列表 UI
- 自由 LLM follow-up
- Kimi CLI 作为 `V1` 首发场景

## 5. 已批准的架构决策

### 5.1 首个 ACP 场景

- 选择：`PM Analysis`
- 原因：它有现成业务能力和明确的追问需求，最适合做 ACP 第一楔子

### 5.2 接口形状

- 选择：单个 `POST` 流式 chat 接口
- 不是：
  - 先建 session，再单独连 stream 的两段式方案

### 5.3 follow-up 策略

- 选择：rules-based follow-up
- 不是：
  - 立即引入完整 LLM runtime

### 5.4 session 持久化

- 选择：`Managed Redis`
- 目标：
  - 支持跨服务重启恢复
  - 通过 TTL 管理会话
- 不是：
  - 长期业务记录数据库

### 5.5 扩展端复杂度控制

- ACP PM 分析逻辑从 [`popup.js`](../../../extension/src/popup.js) 中拆出独立模块
- 不把会话、流式解析、追问状态继续堆到 popup 巨石文件里

### 5.6 服务端职责边界

- [`pm-analysis.service.ts`](../../../server/src/application/services/pm-analysis.service.ts) 继续只做分析
- 新增 ACP façade service 负责：
  - session
  - follow-up
  - 事件整形
  - 流式编排

## 6. 总体架构

### 6.1 ACP V1 架构图

```text
Extension Popup
  |
  | POST /api/acp/pm-analysis/chat
  | body: { sessionId?, operatorLarkId, projectKeys, timeWindowDays, message }
  v
ACP PM Analysis Controller
  |
  +--> ACP PM Analysis Service
         |
         +--> Redis Session Store
         +--> PM Analysis Service
         +--> PM Analysis Followup Service
         +--> Event Stream Shaper
```

### 6.2 数据流

```text
首次请求
  -> 不带 sessionId
  -> 创建 session
  -> 运行 PM analysis
  -> 保存分析快照
  -> 返回 analysis.result

追问请求
  -> 带 sessionId
  -> 读取 session
  -> 基于已有分析结果做规则化 follow-up
  -> 刷新 TTL
  -> 返回 followup.result
```

## 7. 服务端设计

### 7.1 复用现有模块

当前服务端已有可复用部分：

- [`server/src/modules/pm-analysis/pm-analysis.controller.ts`](../../../server/src/modules/pm-analysis/pm-analysis.controller.ts)
- [`server/src/modules/pm-analysis/pm-analysis.dto.ts`](../../../server/src/modules/pm-analysis/pm-analysis.dto.ts)
- [`server/src/application/services/pm-analysis.service.ts`](../../../server/src/application/services/pm-analysis.service.ts)
- [`server/tests/pm-analysis.service.test.ts`](../../../server/tests/pm-analysis.service.test.ts)

ACP `V1` 的策略是**包壳复用**，不是替换这些模块。

### 7.2 新增服务端模块

#### HTTP 模块

- `server/src/modules/acp-pm-analysis/acp-pm-analysis.controller.ts`
- `server/src/modules/acp-pm-analysis/acp-pm-analysis.dto.ts`

职责：

- 处理 `POST /api/acp/pm-analysis/chat`
- 校验请求
- 输出 `text/event-stream`
- 序列化 ACP 事件

#### 应用服务

- `server/src/application/services/acp-pm-analysis.service.ts`
- `server/src/application/services/pm-analysis-followup.service.ts`

职责：

- ACP façade 编排
- 首问/追问分流
- session 读写
- follow-up 规则解释
- 事件整形

#### 持久化适配器

- `server/src/adapters/acp/session-store.ts`
- `server/src/adapters/acp/redis-session-store.ts`

职责：

- 定义 `SessionStore` 抽象
- 用 Redis 实现 session create/get/save/refresh/delete

#### 可选工具文件

- `server/src/modules/acp-pm-analysis/event-stream.ts`

职责：

- 统一 SSE event 写法
- 避免 controller/service 重复拼接 event frame

### 7.3 服务端职责边界

```text
Controller:
  validate + stream

ACP PM Analysis Service:
  session + orchestration + event order

PM Analysis Service:
  pure analysis only

PM Analysis Followup Service:
  rules-based follow-up only

Redis Session Store:
  persistence only
```

## 8. 扩展端设计

### 8.1 复用现有模块

当前扩展端已有可复用部分：

- [`extension/src/popup.js`](../../../extension/src/popup.js)
- [`extension/src/types/protocol.ts`](../../../extension/src/types/protocol.ts)

当前 [`analyzeBtn`](../../../extension/src/popup.js) 还是占位状态，所以 ACP `V1` 会把这块补成真正的 PM 分析入口。

### 8.2 新增扩展端模块

- `extension/src/popup/pm-analysis-chat.ts`
- `extension/src/types/acp-pm-analysis.ts`

职责：

#### `pm-analysis-chat.ts`

- 发起首次分析请求
- 持有当前 `sessionId`
- 读取流式响应
- 解析事件
- 驱动追问流程
- 管理当前线程的 UI 状态

#### `acp-pm-analysis.ts`

- 定义 ACP PM 分析请求类型
- 定义 stream event 类型
- 统一 event name 和 payload shape

### 8.3 为什么不走 Background 转发

ACP `V1` 的 PM 分析建议直接由 popup 调服务端，而不是额外定义新的 `UI -> Background -> popup stream relay` 链路。

原因：

- 这是一个流式对话场景
- popup 直接 `fetch + readable stream` 更直接
- Background 继续专注在：
  - 认证
  - page bridge
  - legacy 动作

## 9. 协议设计

### 9.1 新接口

```text
POST /api/acp/pm-analysis/chat
```

### 9.2 请求模型

首次请求：

```json
{
  "sessionId": null,
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

### 9.3 事件模型

建议事件：

- `session.created`
- `analysis.started`
- `analysis.progress`
- `analysis.result`
- `followup.result`
- `error`
- `done`

示例：

```text
event: session.created
data: {"sessionId":"sess_pm_001"}

event: analysis.started
data: {"phase":"pm-analysis","message":"正在分析项目状态"}

event: analysis.progress
data: {"phase":"pm-analysis","message":"正在聚合 blocker 与 stale item"}

event: analysis.result
data: {"sessionId":"sess_pm_001","data":{...}}

event: followup.result
data: {"sessionId":"sess_pm_001","data":{...}}

event: error
data: {"errorCode":"ACP_SESSION_NOT_FOUND","errorMessage":"会话不存在或已过期","recoverable":true}

event: done
data: {"sessionId":"sess_pm_001"}
```

### 9.4 错误码

新增 ACP 相关错误码建议：

- `ACP_SESSION_NOT_FOUND`
- `ACP_SESSION_EXPIRED`
- `ACP_UNSUPPORTED_FOLLOWUP`
- `ACP_STREAM_INIT_FAILED`

## 10. Session 设计

### 10.1 session 边界

`V1` 的 session 故意收窄为：

- `operatorLarkId`
- `projectKeys[]`
- `timeWindowDays`
- `analysisSnapshot`
- `messageHistory`
- `createdAt`
- `updatedAt`

### 10.2 Redis 持久化模型

一个 session 对应一个 Redis key。

建议保存：

- `sessionId`
- `operatorLarkId`
- `projectKeys[]`
- `timeWindowDays`
- 上次 PM analysis 快照
- follow-up message history
- `createdAt`
- `updatedAt`

约束：

- TTL 为短时操作型 TTL，不做长期档案
- follow-up 成功后刷新 TTL
- `V1` 不做 session 列表索引

## 11. 实现顺序

建议按这个顺序落地：

1. 定义 DTO 和 ACP event types
2. 增加 `SessionStore` 接口
3. 增加 Redis-backed session store
4. 增加 `pm-analysis-followup.service.ts`
5. 增加 `acp-pm-analysis.service.ts`
6. 增加 streaming controller + route
7. 在扩展侧增加 `pm-analysis-chat.ts`
8. 接到 popup 入口

## 12. 成功标准

- PM 能发起一次 ACP PM 分析
- 服务端返回流式状态
- 首问完成后能追问至少一次
- 追问不需要重新输入 scope
- follow-up 使用已有 session 上下文
- 服务重启后，只要 Redis key 还活着，session 仍可恢复
- 现有 `POST /api/pm/analysis/run` 不被破坏

## 13. 演进路线

### 13.1 V1

只做 `PM Analysis ACP Facade`

```text
Popup -> ACP PM Analysis Controller -> ACP PM Analysis Service
      -> Redis Session Store
      -> PM Analysis Service
      -> Followup Service
```

### 13.2 V1.5

抽公共能力：

- `acp-session.service.ts`
- `acp-stream.service.ts`
- 通用 event types

```text
ACP Session Service <---- Redis
ACP Stream Service
        ^
        |
PM Analysis ACP Service
```

### 13.3 V2

真正变成通用 ACP gateway：

- `acp-orchestrator.service.ts`
- `agent registry`
- `pm-analysis.agent.ts`
- `a1-intake.agent.ts`
- `a2-requirement.agent.ts`

```text
Client -> ACP Controller -> ACP Orchestrator -> Agents
```

## 14. 架构护栏

为了保证 `V1` 以后能平滑长成通用 ACP，当前实现必须守住这些边界：

- `SessionStore` 必须是接口
- Redis 只是一个实现，不要写死在业务服务里
- ACP event types 必须集中定义
- [`pm-analysis.service.ts`](../../../server/src/application/services/pm-analysis.service.ts) 必须保持纯分析职责
- follow-up 逻辑必须独立
- popup 不要重新变成巨石文件

## 15. 相关文档

- [V2 Agent Platform / ACP 演进设计](./14-v2-architecture-design.md)
- [插件消息协议与 API Schema](./11-extension-message-and-api-schema.md)
- [AI Agent / Skill 设计](./05-ai-agent-skill-design.md)
