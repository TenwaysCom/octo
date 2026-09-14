---
title: "FE AI Session 关闭与刷新行为讨论"
module: acp
status: completed
requirement_version: 4
created_on: 2026-09-06
updated_on: 2026-09-06
closed_on: 2026-09-06
owner: TBD
related:
  - "./2026-09-05-hermes-acp-integration.md"
---

# FE AI Session 关闭与刷新行为讨论

## 目标

X 只收起显示，任务由 Server 继续执行；再次打开加载历史与当前进度，刷新及切页不会取消本轮。用户已确认按该语义实施，停止生成使用独立操作。

## 验收标准

- [x] 从当前代码追踪 X、页面卸载、HTTP 断连与 ACP 取消路径。
- [x] 区分本轮执行取消、历史恢复和运行中重连。
- [x] 用户确认关闭、停止、刷新和待审批的行为契约。
- [x] Ticket/Sprint 生成中 X 和遮罩均可收起；旧响应不重新打开面板或写入其他会话。
- [x] 断连后任务继续，重开读取已有内容，未结束时自动刷新；不重复提交 prompt。
- [x] 显式停止校验 Web 身份、业务对象和精确 runId，保留部分内容；旧停止请求不能取消下一轮。
- [x] 待审批事件可恢复，审批仍遵守原有身份、选项、有效期与失败契约。
- [x] 普通 ACP Session 的审批过期或上一轮失败只标记本轮未验证；原会话仍可输入和继续处理，不新建 Session。
- [x] Ticket/Sprint 停止按钮移到发送旁并使用黑色实心方块，发送使用向上箭头且生成时置灰；显示及禁用条件保持不变，一次性分析保留底部停止入口。
- [x] 定向、全量测试及构建通过，Ticket/Sprint 实际页面配合本地模拟接口完成浏览器验证。

## 背景与范围

Ticket 与 Sprint 的 AI Session 抽屉；涉及 FE 页面、Web SSE controller、ACP proxy/runtime、会话历史服务。Ticket DeepSeek 问题总结为一次性分析，不是可续聊 ACP Session。

## 方案与决策

### 改造前基线（v1 排查）

- Ticket `LarkTicketDetailPage.jsx` 与 Sprint `MeegleSprintPages.jsx` 都在 `isStreaming` 时禁用 X 和遮罩关闭。页面组件卸载会 abort 流请求；刷新浏览器也会断开连接。
- 两个 controller 将请求 `aborted` / 响应 `close` 绑定到传入业务服务的 AbortSignal。ACP runtime 收到 prompt abort 后请求 `cancelSession` 并关闭连接；proxy 清理内存 runtime。
- 内存 registry 删除不删除 PostgreSQL ownership。历史服务可按已保存映射恢复原生会话，但不能保证被中断轮次的全部增量均已保存。
- 历史服务对 busy session 返回 `SESSION_BUSY`，现有 load 不是运行中重新订阅；不能只解除 X 的禁用就宣称关闭后可恢复观看。
- FE 消息存于 drawer；直接 `setDrawer(null)` 后，流回调遇到空 drawer 会跳过消息更新。
- DeepSeek 问题总结将同一个 AbortSignal 传给模型请求。取消不是回滚：模型返回后已经进入的处理或已完成写入不能由页面断连自动撤销。

### v2 已确认方案与实现

1. X 只收起面板，生成继续；在当前业务对象的 Session 列表显示运行中及待审批状态，允许重新打开。
2. 提供单独“停止生成”，取消当前轮次并保留已保存历史，使用明确的停止状态。
3. 刷新、切页及短暂断网只断开观看连接；后端继续受超时限制地运行，回来后读取状态、补齐内容并继续订阅，不重复提交 prompt。
4. 待审批仍要求用户操作；隐藏面板不能自动批准。保留审批期限，重新打开显示实际状态。
5. 抽屉可见性、Session 历史、本轮 run 和订阅分别管理；Server 持有执行状态。审批服务的断连清理契约需随之审查。

执行与 HTTP 连接已解耦。实现使用当前 Server 进程内的 run 状态和事件快照，持久历史仍由原生 Agent 承载；未引入数据库 migration、队列或新的服务。Server 重启后自动续跑不在本次范围。

### v3 审批过期后延续原会话

普通 Ticket ACP Session 的审批过期或上一轮失败后保留未验证提示，同时继续开放输入。用户继续输入或点击“继续处理”时沿用原 `sessionId`；过期审批仍由原 `requestId` 失效机制拒绝，如再次需要工具操作则生成新审批。一次性 DeepSeek 分析仍按原行为重新执行。本次没有增加 ID、数据库字段或后端审批流程。

- `web-ai-session-runs.ts` 负责运行、并发保护、事件快照、停止与超时。每个 Web controller 最多 16 个活动任务；每轮 15 分钟超时；完成快照保留 30 分钟，最多保留 100 轮；过期后原生 Session 历史仍可加载。DeepSeek 只显示临时的一次性运行记录，不创建可续聊 ACP Session，长期结果仍在 Ticket AI。
- 保留已有 POST SSE 接口；增加 `run.started` 事件，提供独立 runId。浏览器断连只停止向该响应发送事件。list 合并已保存 Session 与当前运行状态；load 优先读取运行快照，避免对 busy runtime 执行原生 load。
- Ticket/Sprint 各自增加 `POST .../ai-sessions/:sessionId/stop`，DTO 只接受业务对象引用与 runId。X 不调用 stop；收到服务端 run.started 后即可断开浏览器订阅，若关闭发生在启动确认前则等待确认后再断开，避免占用隐藏会话连接或丢掉启动请求。运行中的 Web 交互任务继续使用 interactive 审批模式，隐藏面板不会切成无人审批的 worker。
- FE 共用 `useAiSessionPanel`/`ai-session-panel`；会话列表每 3 秒刷新，重新打开的运行面板每 1 秒加载快照。状态读取不会创建新 prompt。显示版本号隔离旧事件、旧请求返回及旧定时器清理；显式停止后用服务端快照确定终态。
- 本轮 `done` 延迟到业务服务整体成功后才发布和进入快照；取消检查位于 Ticket ACP 后处理及 DeepSeek 正式分析写入前。已执行写入不能由停止按钮回滚。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-06 | v1 | planned | 完成 FE → controller → proxy → runtime / history 的静态追踪，提出交互建议。 | 当时没有启动真实会话或刷新实验。 |
| 2026-09-06 | v2 | completed | 用户确认后实施服务端运行、快照读取、显式停止及共用 FE 面板。隔离工作区验证后同步回当前工作区。 | 未提交、未推送；未调用真实模型或写入业务平台。 |
| 2026-09-06 | v3 | completed | Ticket 普通 ACP Session 的未验证状态不再禁用输入；继续处理沿用原 `sessionId`，一次性分析保持原行为。FE 163 项测试和 production build 通过。 | 未运行真实 Hermes 审批过期流程。 |
| 2026-09-06 | v4 | completed | 用户确认输入区按钮布局：停止移到发送左侧，用黑色实心方块 SVG；发送使用向上箭头 SVG，禁用时呈灰色。保持 `isStreaming` 显示条件和原禁用判断；一次性分析运行中在底部显示停止图标，不新增续聊能力。图标保留 aria-label 与 title。`pnpm --config.verify-deps-before-run=false --dir fe check` 通过（163 项测试及 Vite build），`git diff --check` 通过。 | 本次仅修改两个 FE 页面和共享样式；未新增测试，未进行本次图标布局的浏览器目测或真实模型验证。日志：`/private/tmp/octo-ai-composer-fe-check.log`。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态追踪 / diff | 完成 | FE → Web controllers → run service → 原有业务 service；`git diff --check` | 当前分支实现，不是部署证明。 |
| Server 全量 / 定向 / build | 通过 | 当前工作区最终全量 764 项通过，1 项可选原生协议测试跳过；定向 21 项通过，`tsc` 通过。 | 使用 mock / 本地 fixture；Server 及 FE 均已在当前工作区完成最终测试和构建。 |
| FE 全量 / build | 通过 | 163 项通过，Vite production build 通过。覆盖关闭、重开、刷新读取、串会话、停止、审批快照、StrictMode 及旧流收尾不清掉新轮询。 | 无真实模型调用。 |
| 浏览器 + 本地模拟接口 | 通过 | 实际 `LarkTicketDetailPage`、`MeegleSprintDetailPage`，React StrictMode，真实 Web controller/run service，注入模拟业务 service，loopback 4419。Ticket X → 重开 → 刷新 → 重开时计数仍为 started=1/cancelled=0/pending=1；完成后读取完整结果。两次显式停止后 started=3/cancelled=2/completed=1；Sprint X → 重开 → 后台完成后 started=4/cancelled=2/completed=2/pending=0，面板自动更新。 | 不连接真实 Lark、Meegle、DeepSeek、Kimi 或 Hermes；不证明原生工具取消延迟或服务重启续跑。 |
| 真实 loopback HTTP + 模拟业务 | 通过 | 当前 FE 面板和 API 客户端发起真实 fetch/SSE，X abort 观察连接后后台 signal 未取消；再次 load 取得 partial，最终轮询进入 ready，启动次数始终为 1。 | 使用注入的模拟业务 service，无模型或业务平台访问。临时验证脚本位于 `/private/tmp/octo-ai-session-http-detach.mjs`。 |

## 关联

- [Hermes ACP 接入](./2026-09-05-hermes-acp-integration.md)
- [Sprint AI Sessions](../ai-tasks/2026-08-28-sprint-release-notes-ai-sessions.md)

## 复盘

X 被禁用的直接原因是生成锁。生命周期耦合同时存在于 FE drawer 消息状态、HTTP 连接和 busy runtime 的 load 限制，需一起处理。

浏览器验证暴露旧 SSE 的 finally 会调用 schedule，先清理当前 timer、后判断显示版本，导致重开或停止后的轮询丢失。修复为任何定时器清理前先校验版本，并加入行为回归。另补上 cold follow-up 保留原 Session 标题/Action 的回归，避免运行摘要的空字段覆盖持久元数据。
