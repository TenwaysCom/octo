# ACP Popup Frontend Design

本设计文档分成两层：

- 当前兼容方案：和现在已经完成的 ACP Task 1 / Task 2 实现保持一致
- 目标态升级方案：描述后续 Task 3+ 要长成什么样

这样文档既能指导当前实现，也不会把未来的富交互设计误写成已经落地的能力。

---

## 1. 设计定位

当前 popup 已经具备这些能力：

- 通过 `POST /api/acp/kimi/chat` 与服务端建立 ACP 聊天入口
- 支持单 popup、单活跃会话的连续 follow-up
- 在 popup 打开期间保留 `sessionId`、transcript、draft input
- 处理基础会话错误：`SESSION_NOT_FOUND` / `SESSION_FORBIDDEN` / `SESSION_BUSY`

当前实现的重点是：

- 先把 Kimi ACP 会话用起来
- 保持流式可见
- 不过早引入复杂消息模型和富卡片 UI

---

## 2. 当前兼容方案

### 2.1 协议接入方式

当前前端接收的是**后端转发后的 ACP 命名 SSE 事件**，而不是 Kimi / OpenAI 风格的 `choices[0].delta` 流。

当前兼容方案只处理这三类事件：

- `session.created`
- `acp.session.update`
- `done`

前端不能假设流里存在：

- `reasoning_content`
- `tool_calls[]`
- `[DONE]`

这些如果要用，必须等目标态里基于 ACP `sessionUpdate` 类型做聚合。

### 2.2 当前状态模型

当前层继续使用轻量模型，不直接引入完整 `ChatMessage` 聚合结构。

```ts
interface KimiChatRequest {
  operatorLarkId: string;
  sessionId?: string;
  message: string;
}

interface KimiChatTranscriptEntry {
  id: string;
  text: string;
}

interface KimiChatSessionState {
  sessionId: string | null;
  busy: boolean;
  draftMessage: string;
  transcript: KimiChatTranscriptEntry[];
}
```

当前层只维护：

- 当前 bridge `sessionId`
- 当前 transcript
- 当前 draft input
- 当前是否流式处理中

不在当前层维护：

- thoughts 字段
- toolCalls 列表
- markdown AST
- citation/source 索引

### 2.3 当前 UI 结构

当前兼容层使用简化聊天面板：

- 顶部状态区
- transcript 列表
- 输入框 + 发送按钮

当前 transcript 的显示原则：

- user message 单独一条
- assistant 流式文本按“每次发送一条 assistant turn”聚合
- `session.created` / `done` 用辅助状态行显示

当前层不承诺：

- thought 折叠区
- tool call 卡片
- markdown 渲染
- 引用来源跳转

### 2.4 当前会话模型

当前兼容方案把“连续会话”定义为**最小可用能力**：

- 单 popup
- 单活跃会话
- 会话状态只保存在 popup 本地内存
- popup 关闭后不恢复
- 无 background-owned session
- 无多标签同步

当前行为约束：

- 第一次发送不带 `sessionId`
- follow-up 发送复用当前 popup 保存的 `sessionId`
- 再次点击 `analyze` 视为显式重置当前 ACP 会话

### 2.5 当前错误恢复

当前兼容层需要明确承诺的恢复行为只有这些：

- `SESSION_NOT_FOUND`：清空本地 `sessionId`，恢复草稿
- `SESSION_FORBIDDEN`：清空本地 `sessionId`，恢复草稿
- `SESSION_BUSY`：保留当前会话，不吞掉错误提示
- 普通发送失败：恢复草稿，不自动重试

当前层不承诺：

- 自动重试
- 历史恢复
- 跨窗口恢复
- 会话列表

### 2.6 当前性能与交互

当前兼容层只把**智能滚动**作为明确要求：

- 用户在底部时，新内容自动跟随
- 用户上滑查看历史时，停止强制吸底

当前层不承诺：

- 渲染节流
- Markdown 流式容错
- 代码块补全
- 停止生成 / Abort

这些全部放到目标态升级方案里。

---

## 3. 目标态升级方案

### 3.1 目标态消息模型

从 Task 3 开始，前端引入完整聚合模型：

```ts
type MessageRole = "user" | "assistant" | "system" | "tool";

interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  status: "calling" | "success" | "error";
  result?: string;
}

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  thoughts?: string;
  toolCalls?: ToolCall[];
  status: "streaming" | "done" | "error";
  createdAt: number;
}
```

这个结构是**前端聚合模型**，不是 ACP wire format 本身。

### 3.2 ACP 事件到消息模型的映射

目标态里，前端基于 ACP `sessionUpdate` 聚合：

- `agent_message_chunk` -> `ChatMessage.content`
- `agent_thought_chunk` -> `ChatMessage.thoughts`
- `tool_call` / `tool_call_update` -> `ChatMessage.toolCalls`
- `plan` -> 会话级计划摘要
- `current_mode_update` -> 会话模式状态
- `session_info_update` -> 标题 / 元信息

### 3.3 目标态 UI

目标态消息 UI 拆成三层：

- Thoughts / Reasoning
- Tool Calls
- Final Answer

其中：

- thoughts 默认折叠
- tool calls 用状态卡片展示
- final answer 支持 markdown

### 3.4 目标态交互增强

放到 Task 3 的能力：

- 停止生成 / Abort
- 渲染节流
- Markdown 流式容错
- 更明确的多状态 UI
  - 思考中
  - 调用工具中
  - 回答中

### 3.5 更后面的能力

以下能力不属于当前兼容层，也不要求在 Task 3 立刻完成：

- 引用来源 / 搜索来源跳转
- capability-gated skills UI
- commands UI
- 背景会话持久化
- 多 popup / 多 tab 同步

---

## 4. 与当前实现的关系

当前代码应该被理解成：

- 一个已经可用的 ACP popup probe
- 一个最小连续会话前端
- 一个 Task 3 的前置基础设施

它不是目标态 UI 的缩水版，而是一个**明确受限、可继续演进的兼容层**。

---

## 5. 后续实施顺序

建议后续顺序如下：

1. 完成当前兼容层剩余 polish
2. 在 Task 3 引入 `ChatMessage / thoughts / toolCalls / status`
3. 基于 ACP event rendering 做 richer UI
4. 再做 capability-gated skills / commands
5. 最后再考虑引用来源、搜索证据、跨窗口会话等增强能力

---

## 6. 当前层 Checklist

当前兼容层的完成标准应是：

- 可以发起第一轮聊天
- 可以进行 follow-up
- popup 打开期间保留 transcript / sessionId / draft
- session 失效时能恢复草稿并清掉死会话
- transcript 至少能清晰区分 user / assistant / 状态行
- 智能滚动策略有落地方案

---

## 7. 目标态 Checklist

目标态的完成标准应是：

- 有完整消息聚合模型
- thoughts 和 tool calls 可视化
- final answer 支持 markdown
- 有 stop / abort
- 高频流式更新不会卡 UI
- 为 skills / commands 留出稳定消息和 capability 接口
