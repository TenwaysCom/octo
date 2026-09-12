---
title: "AI Session 回复复制控件"
module: ai-tasks
status: done
requirement_version: 1
created_on: 2026-08-28
updated_on: 2026-08-28
closed_on: 2026-08-28
owner: Codex
related:
  - "docs/tasks/ai-tasks/2026-08-28-sprint-release-notes-ai-sessions.md"
---

# AI Session 回复复制控件

## 目标

在 FE 的 AI Session 助手回复上提供轻量 Copy 控件，将该条回复正文写入浏览器剪贴板；不为用户消息或状态消息增加复制按钮。

## 验收标准

- [x] Ticket 与 Sprint AI Session 的助手回复均显示复制控件。
- [x] 点击后复制当前回复全文，并短暂反馈成功或失败状态。
- [x] FE 全量检查通过。

## 背景与范围

Ticket 与 Sprint 使用同一套消息视觉样式，但消息渲染入口不同。本次共享复制按钮和反馈交互，不改变 Session 数据、SSE 协议或服务端行为。

## 方案与决策

新增共享 `AiSessionCopyButton`，使用浏览器 Clipboard API；控件只由有正文的 assistant 消息渲染，并以图标、tooltip、动态无障碍标签和短时状态色反馈结果。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-28 | v1 | done | Ticket 与 Sprint 消息入口已接入共享复制控件；FE 24 项测试和 Vite 生产构建通过。 | 未执行真实浏览器剪贴板权限交互测试。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE check | 通过 | `pnpm --dir fe check`：24 项测试通过，Vite build 通过。 | 构建与单测不验证浏览器对 Clipboard API 的实际授权。 |

## 关联

- `fe/src/components/ai-session/AiSessionCopyButton.jsx`
- `fe/src/pages/LarkTicketDetailPage.jsx`
- `fe/src/pages/MeegleSprintPages.jsx`
