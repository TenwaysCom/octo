---
title: "FE Session 按轮次与工具步骤分组"
module: acp
status: done
requirement_version: 1
created_on: 2026-09-06
updated_on: 2026-09-06
closed_on: 2026-09-06
owner: Codex
related:
  - "./2026-09-06-fe-ai-session-lifecycle-discussion.md"
---

# FE Session 按轮次与工具步骤分组

## 目标

修复 FE 把不同步骤的思考、工具调用和正文合并到同一 AI 消息的问题；同段流式碎片继续合并，跨用户轮次、跨工具后的响应步骤分别显示。

## 验收标准

- [x] 缺少或复用 `messageId` 时，工具之后的新思考或正文开始新段；连续思考、正文碎片仍合并。
- [x] 新用户输入与 `done` 隔离轮次，重复 ID 不把新内容追加到旧回复。
- [x] 同步骤的多个工具合并；迟到的状态更新只更新本轮中原工具所在段，不在最新段复制工具。
- [x] 计划/审批事件保留，工具审批完成不会制造重复调用。
- [x] 历史恢复使用唯一且稳定的 React key，续聊、关闭重开与历史显示分组一致。
- [x] FE 全量测试、构建和使用模拟 API 的实际 Ticket 页面浏览器验证通过。

## 背景与范围

- `ai-session-transcript.js` 原先有 ID 时在完整历史中 `findIndex`，无 ID 时只看最后一个 assistant；没有模型步骤边界。
- 本机 Hermes `acp_adapter/server.py` 的历史回放按思考、正文、工具开始/完成顺序发出事件，通常不附带 `messageId`，因此旧逻辑会吞掉步骤边界。
- `ai-session-panel.js` 恢复消息时用 provider `messageId` 作 React key，也会因重复 ID 产生冲突。
- 本次修改共用 FE transcript/snapshot 分组，以及 Ticket 消息内的展示顺序；不修改 Server、原生 Agent、权限或业务写回。Sprint 继续使用原有正文展示方式。

## 方案与决策

1. 用用户消息和带 `turnComplete` 的完成/停止状态划定用户轮次，assistant 只在本轮最后一段继续合并。
2. 工具之后出现思考/正文、正文之后重新思考、明确的消息 ID 改变时开始新段。没有可观察边界的连续正文不凭空拆分。
3. 工具状态按本轮内 `toolCallId` 找回所属段；计划和权限卡片不会把一个工具复制成两个。
4. 历史 React key 使用 Session、消息种类与消息位置，不依赖可复用的 provider ID。
5. Ticket 单段按思考、正文、工具顺序展示；工具之后的总结已在下一段，避免将调用前说明移到工具后面。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-06 | v1 | in_progress | 新增回归用例先复现：跨用户轮次复用 ID 得到 `第一轮第二轮`，而非两个独立回复。随后修复分组和恢复 key。 | 当前工作区为干净的 `feat/add_octo_fe`，此次改动保持在现有 FE 文件。 |
| 2026-09-06 | v1 | done | 定向测试通过；最终 FE 170/170 测试及 Vite 构建通过。浏览器模拟三轮输入、五段思考/工具和最终回复，续聊并关闭重开后仍为 3 条用户消息、8 个 AI 段。 | 未调用真实模型，未访问或写入 Lark/Meegle，未部署、提交或推送。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单测 / 构建 | 通过 | `pnpm --dir fe check`：170/170，Vite build 成功 | FE 本地检查，Server 未改动 |
| 浏览器模拟验证 | 通过 | 实际 Ticket 抽屉的历史加载、SSE 续聊、关闭重开；[模拟界面截图](/Users/linyu/.codex/visualizations/2026/09/06/01a07577-a8ff-71b3-a716-0399da09605b/ai-session-turns/ai-session-turns.png) | 全部 API 被拦截为虚构数据；SSE 按顺序发送多个事件，但未模拟真实网络延迟 |
| 浏览器恢复读回 | 通过 | DOM 为 3 条用户消息、8 个 AI 段、5 个思考区域，三轮结论均独立保留；没有 React key 警告 | 不代表真实模型/生产验收 |
| 补丁检查 | 通过 | `git diff --check` | 不含部署验证 |

浏览器工具准备时，默认 npx wrapper 因网络限制失败，改用已缓存的 CLI；启动 daemon 的缓存目录需要沙箱外权限，审批通过后继续。模拟脚本最初使用了 CLI 执行环境未提供的 `URL` 全局，改为固定本地地址匹配后完成验证，均未改动产品依赖。

## 关联

- [FE AI Session 生命周期](./2026-09-06-fe-ai-session-lifecycle-discussion.md)
- 分组回归：`fe/src/lib/ai-session-transcript.test.js`、`fe/src/lib/ai-session-panel.test.js`
