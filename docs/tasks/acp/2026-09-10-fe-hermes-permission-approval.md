---
title: "FE Hermes ACP 人工权限审批"
module: acp
status: completed
requirement_version: 1
created_on: 2026-09-10
updated_on: 2026-09-10
closed_on: 2026-09-10
owner: TBD
related:
  - "./2026-09-05-hermes-acp-integration.md"
  - "./2026-09-06-fe-ai-session-lifecycle-discussion.md"
---

# FE Hermes ACP 人工权限审批

## 目标

核查并补齐 Ticket / Sprint AI Sessions 的 Hermes ACP 权限交互：用户查看申请的操作，手动允许或拒绝，并明确看到等待和处理结果。

## 验收标准

- [x] 待审批请求展示操作、文件 diff / 完整参数、倒计时及原生选项；新请求进入可见区域。
- [x] 单次允许继续执行；拒绝、过期和停止后不能再次点击提交；提交中避免重复点击，失败可重试。
- [x] 重新打开会话可从服务端快照恢复待审批状态；待审批或拒绝后的晚到 done 不显示验证成功。
- [x] FE 测试、构建及服务端审批回归通过，并记录浏览器验证边界。

## 背景与范围

已有服务端原生权限回调、50 秒超时、Web 身份和会话归属校验、原生 optionId 回复接口及 FE 共享审批组件。本次复用这些接口，只补齐 FE 呈现与状态问题。现有安全编辑自动批准和 Hermes 原生风险策略保持原任务定义。

## 方案与决策

- Ticket / Sprint 共用审批卡片，展示命令、文件修改前后内容和完整原始参数；无默认自动点击或授权。
- 卡片显示倒计时和拒绝/超时后果，抽屉标题提示待审批。新请求自动滚动到卡片；不自动聚焦允许按钮。
- 回复只提交 sessionId、actionRunId、requestId 和原生 optionId。组件防重复点击，点击时重验截止时间，已处理/过期响应收起操作按钮，普通网络错误允许重试。
- 执行状态与验证状态按审批事件保持一致，不因晚到 done 把待审批或失败标为成功。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-10 | v1 | in_progress | 确认原有链路已接入；补齐审批详情、可见性及按钮状态。发现实时流的 runStatus / verificationStatus 无条件接受 done，已改为与显示状态一致。 | 后续验证见下表。 |
| 2026-09-10 | v1 | completed | FE 包级检查及 25 项审批相关单测、43 项服务端回归、共享真实组件浏览器模拟交互通过；同步生命周期说明及跨任务审批验收规则。 | 未部署；未运行真实登录、在线模型或 Ticket/Sprint 外部业务写入。 |

根因与复盘：原卡片只读取 command / 文本 content，未呈现 ACP diff 和通用 rawInput；未配置审批视觉样式及滚动提示。实时 panel 的 runStatus / verificationStatus 又独立于审批显示状态接受 done，可能产生互相矛盾的成功提示。本次补齐内容呈现和状态一致性。临时浏览器验证需要沙箱外本机监听，并显式使用已有 Chromium 路径；未下载依赖，临时页面已删除。

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测 / 构建 | 通过 | `pnpm --dir fe check`（37 个测试文件及 Vite 构建）；`node --test --test-isolation=none fe/src/lib/ai-session-panel.test.js fe/src/lib/ai-session-transcript.test.js fe/src/services/acp/acp-permission-api.test.js`（25 项） | 新增实时审批与晚到 done 回归；既有快照恢复与回复 payload 测试复用。 |
| Server 审批回归 | 通过 | `pnpm --dir server test` 指定 `acp-permission.service`、`acp-permission.controller`、`acp-kimi-proxy.service`、`web-ai-session-runs`、`web-ai-session-lifecycle.controller`、`hermes-acp-runtime` 六个测试文件，43 项通过。 | 真实服务编排与 mock adapter / 身份依赖；本次没有修改 Server 运行代码。 |
| 浏览器 mock integration | 通过 | 临时 Vite 页面加载真实 `AcpPermissionPrompt` 与 `replyAcpPermission`，Playwright + 本机 Chromium 验证自动滚动、diff/参数、允许、拒绝、倒计时及已过期申请、已处理申请、失败重试、提交锁定、停止、恢复和 390px 窄屏；核对 5 次精确请求 payload，无页面异常。 | HTTP 回复拦截及组件状态模拟，不是真实登录 / 在线 Hermes / 完整业务页面 E2E；没有外部业务写入。 |

## 关联

- [Hermes 接入任务](./2026-09-05-hermes-acp-integration.md)
- [FE 会话生命周期](./2026-09-06-fe-ai-session-lifecycle-discussion.md)
