---
title: "FE AI Session 关闭与刷新行为讨论"
module: acp
status: planned
requirement_version: 1
created_on: 2026-09-06
updated_on: 2026-09-06
closed_on: null
owner: TBD
related:
  - "./2026-09-05-hermes-acp-integration.md"
---

# FE AI Session 关闭与刷新行为讨论

## 目标

解释生成期间 X 无法关闭及刷新页面的行为，讨论会话窗口与执行生命周期。当前仅排查和提出建议，未授权实施设计变更。

## 验收标准

- [x] 从当前代码追踪 X、页面卸载、HTTP 断连与 ACP 取消路径。
- [x] 区分本轮执行取消、历史恢复和运行中重连。
- [ ] 用户确认关闭、停止、刷新和待审批的行为契约。
- [ ] 设计确认后补充实现与运行时验收项。

## 背景与范围

Ticket 与 Sprint 的 AI Session 抽屉；涉及 FE 页面、Web SSE controller、ACP proxy/runtime、会话历史服务。Ticket DeepSeek 问题总结为一次性分析，不是可续聊 ACP Session。

## 方案与决策

### 当前代码事实

- Ticket `LarkTicketDetailPage.jsx` 与 Sprint `MeegleSprintPages.jsx` 都在 `isStreaming` 时禁用 X 和遮罩关闭。页面组件卸载会 abort 流请求；刷新浏览器也会断开连接。
- 两个 controller 将请求 `aborted` / 响应 `close` 绑定到传入业务服务的 AbortSignal。ACP runtime 收到 prompt abort 后请求 `cancelSession` 并关闭连接；proxy 清理内存 runtime。
- 内存 registry 删除不删除 PostgreSQL ownership。历史服务可按已保存映射恢复原生会话，但不能保证被中断轮次的全部增量均已保存。
- 历史服务对 busy session 返回 `SESSION_BUSY`，现有 load 不是运行中重新订阅；不能只解除 X 的禁用就宣称关闭后可恢复观看。
- FE 消息存于 drawer；直接 `setDrawer(null)` 后，流回调遇到空 drawer 会跳过消息更新。
- DeepSeek 问题总结将同一个 AbortSignal 传给模型请求。取消不是回滚：模型返回后已经进入的处理或已完成写入不能由页面断连自动撤销。

### 建议，尚未确认

1. X 只收起面板，生成继续；在当前业务对象的 Session 列表显示运行中及待审批状态，允许重新打开。
2. 提供单独“停止生成”，取消当前轮次并保留已保存历史，使用明确的停止状态。
3. 刷新、切页及短暂断网只断开观看连接；后端继续受超时限制地运行，回来后读取状态、补齐内容并继续订阅，不重复提交 prompt。
4. 待审批仍要求用户操作；隐藏面板不能自动批准。保留审批期限，重新打开显示实际状态。
5. 抽屉可见性、Session 历史、本轮 run 和订阅分别管理；Server 持有执行状态。审批服务的断连清理契约需随之审查。

实施范围待确认。刷新后继续执行需要后端执行与 HTTP 连接解耦、状态查询及事件恢复；不能作为只改按钮的修补。Server 重启后自动续跑不默认纳入。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-06 | v1 | planned | 完成 FE → controller → proxy → runtime / history 的静态追踪，提出交互建议。 | 等待设计讨论；没有启动真实会话或刷新实验。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态追踪 | 完成 | `fe/src/pages/LarkTicketDetailPage.jsx`、`fe/src/pages/MeegleSprintPages.jsx`；两处 AI controller；`acp-kimi-proxy.service.ts`、`acp-kimi-session-history.service.ts`、`acp-runtime.ts`、`in-memory-kimi-session-registry.ts` | 当前工作区含既有未提交修改；不证明部署版本及实际进程停止时序。 |
| 单测 / 浏览器 / 原生运行时 | 未执行 | 本次只讨论设计，未改运行代码 | 未证明刷新取消的实际延迟、部分内容持久化及后处理竞态。 |

## 关联

- [Hermes ACP 接入](./2026-09-05-hermes-acp-integration.md)
- [Sprint AI Sessions](../ai-tasks/2026-08-28-sprint-release-notes-ai-sessions.md)

## 复盘

X 被禁用的直接原因是生成锁。设计层面的耦合同时存在于 FE drawer 消息状态、HTTP 生命周期和运行中 load 限制；仅放开按钮会遗漏消息保存与重新观看路径。
