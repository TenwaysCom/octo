# ACP Chat Page Redesign

## Goal

把 popup 里的 `Chat` 页收敛成唯一的 ACP 聊天入口，并把当前过薄的页面壳重构成真正的聊天页容器。

## Confirmed Decisions

- `Chat` 页默认就是 ACP，不再让用户感知单独的 “Kimi Chat 页”
- 现有 `KimiChatPanel` 重命名为 `AcpChatPanel`
- `AcpChatPanel` 只负责纯聊天主体：
  - transcript 渲染
  - 输入框
  - 发送 / 停止
- `ChatPage` 负责会话级 UI：
  - 空会话引导态
  - 会话工具栏
  - 上下文卡片容器
  - 历史抽屉入口占位
  - unsupported/fallback 处理
- 新会话和历史会话入口放在聊天框上方工具栏
- 新会话回到空会话态，并重新显示上下文卡片

## Current Problem

当前结构里：

- `ChatPage` 只是在 `showKimiChat` 为真时透传状态给 `KimiChatPanel`
- `KimiChatPanel` 同时承载产品层页面语义和底层聊天主体
- 后续要加的新会话、历史抽屉、空会话卡片，都没有合适的边界

这会导致会话级交互继续堆进聊天主体组件，最后变成更大的单文件。

## Target Structure

### ChatPage

职责：

- 作为 `chat` tab 的唯一页面
- 决定当前是：
  - unsupported
  - 空会话 ACP
  - 已有会话 ACP
- 组合会话级模块：
  - `SessionToolbar`
  - `QuickStartCards`（本次先做占位结构/插槽）
  - `AcpChatPanel`

### AcpChatPanel

职责：

- 显示 transcript
- 处理草稿输入
- 发出 `send` / `stop` / `update:draftMessage`
- 不再负责页面级入口切换

### SessionToolbar

本次先纳入 `ChatPage` 内部结构，不单拆文件，职责是承载：

- 标题/状态
- `历史会话` 按钮
- `新会话` 按钮

本次以可组合结构为目标，后续接历史抽屉时可以单独抽组件。

## Interaction Rules

- 进入 `Chat` tab 即进入 ACP 页面
- 空会话定义：当前 transcript 为空
- 空会话时显示工具栏 + 空态说明（为后续快速开始卡片留位置）
- 已有会话时显示工具栏 + 聊天主体
- 点击 `新会话`：
  - 清空当前 popup 里的 `sessionId`
  - 清空 transcript
  - 清空 active assistant entry
  - 停止进行中的流式生成
  - 回到空会话态
- 点击 `历史会话`：
  - 本次先暴露事件和按钮
  - 历史抽屉与持久化会话列表后续接入

## Refactor Boundaries

本次重构只覆盖 extension popup：

- `extension/src/popup/components/KimiChatPanel.vue`
- `extension/src/popup/components/KimiChatPanel.test.ts`
- `extension/src/popup/pages/ChatPage.vue`
- `extension/src/popup/App.vue`
- `extension/src/popup/App.test.ts`
- 相关 import / 事件透传 / 测试命名

本次不实现：

- 服务端会话历史接口
- 历史抽屉真实数据源
- 服务端下发上下文卡片
- 多会话恢复

## Testing Intent

- 保留现有流式 transcript 渲染行为
- 保留 `send` / `stop` / draft 更新契约
- 新增 `ChatPage` 对会话工具栏和空态的测试
- 验证改名后 `App` 仍能在 `chat` tab 正常装配聊天页
