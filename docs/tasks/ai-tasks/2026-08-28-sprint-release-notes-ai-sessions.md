---
title: "Sprint Release Notes AI Sessions"
module: ai-tasks
status: in_progress
requirement_version: 3
created_on: 2026-08-28
updated_on: 2026-09-04
closed_on: null
owner: Codex
related:
  - "docs/tasks/platform-data/2026-08-27-meegle-sprint-history.md"
---

# Sprint Release Notes AI Sessions

## 目标

在 Sprint 详情右侧趋势图下提供 AI Sessions 与快捷动作。服务端仅从本地 Sprint 快照和归属历史中选取已完成的 Story、Tech Task、Production Bug，清洗后生成面向公司内部同事的 Release Notes 草稿。

## 验收标准

- [x] Sprint 趋势图下展示 AI Sessions、快捷动作与新建会话入口。
- [x] 服务端按 `projectKey + sprintId` 绑定会话，用户和 Sprint 间不可越权读取。
- [x] 生成上下文只包含完成项三类工作项；生成时不调用或写入 Meegle。
- [x] 快捷动作与普通会话均携带 `actionRunId` 并使用 SSE。
- [ ] 已配置既有 AI 服务后，受控真实 ACP 会话验证通过。

## 背景与范围

复用 Ticket AI 的会话交互、SSE 和会话抽屉，但不复用 Ticket 的 Base 专属会话引用。新增 Sprint 专属引用表和 Web API；不自动发布到 Meegle、Lark 或其他外部系统。

## 方案与决策

`acp_kimi_sprint_session_refs` 保存用户、稳定 Sprint 身份和创建时上下文哈希。服务端以 Sprint 归属区间的 `itemFinishTime` 选取完成项，并以类型投影筛选三类工作项；前端不能提交工作项内容或改变完成项范围。Quick Actions 分别从 `workflow_prompts.meegle.sprint.release_notes`、`meegle.sprint.internal_summary` 和 `meegle.sprint.confirm_gaps` 渲染 Prompt，均为 `read_only`。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-28 | v3 | in_progress | 已完成 Server 会话归属、Sprint 上下文、SSE API、趋势图下前端会话 UI、Quick Actions；三个 Quick Action 分别使用独立的数据库 Prompt。 | 无额外 workspace/Skill 配置；未启动真实 ACP。 |
| 2026-09-04 | v3 | in_progress | 台账复核确认路由、actionRunId 传递、数据库 Prompt 和会话归属实现仍在；当前 Server 全量 146 files / 707 tests、FE 33 files 测试与 production build 通过。 | 仅剩受控真实 ACP 会话：使用已配置的内部 AI 身份启动一个 Sprint Quick Action，核对 SSE 结束状态与会话归属；本次复核未发起外部调用。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server / FE build | 通过 | `pnpm --dir server build`、`pnpm --dir fe check`（91 项）与 `pnpm --dir fe build`。 | 静态构建，不证明数据库 migration 或 ACP 运行时。 |
| 定向测试 | 通过 | Server 4 个文件 13 项；Sprint AI 前端 API 2 项。 | 使用 mock，不访问 Meegle 或 Kimi。 |

## 关联

- `fe/src/pages/MeegleSprintPages.jsx`
- `server/src/application/services/meegle-sprint-ai-session.service.ts`
- `server/src/modules/meegle-sprint-ai/meegle-sprint-ai.controller.ts`
