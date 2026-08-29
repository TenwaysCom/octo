---
title: "Octo CLI bootstrap"
module: "cli"
status: in_progress
requirement_version: 3
created_on: 2026-08-29
updated_on: 2026-08-29
closed_on: null
owner: Codex
---

# Octo CLI bootstrap

## 目标

建立一个类似 `lark-cli` 的本地 `octo-cli`：可配置 Octo 服务地址与 agent API token，读取已经同步到 Octo 的 Sprint burn-down、Sprint 工作项/任务状态、GitHub PR 关联的 Meegle 工作项和 Lark Ticket 当前投影；并能将随包 skill 安装到本地 Codex。

## 当前有效需求

- CLI 为独立 `octo-cli/` TypeScript 包，提供清晰 help、配置、数据读取、skills 和 `agent install` 命令。
- 本地配置只允许保存 Octo server URL 与 agent API token；不能保存或传递 browser cookie、Lark/Meegle/GitHub token。
- 数据命令必须读取 Octo agent API 的同步投影，不在 CLI 中直连第三方平台。
- 随包 skills 覆盖 Sprint、GitHub PR、Lark Ticket 与跨平台路由四个只读查询场景。
- `docs/tasks/` 新增 `cli` 模块。

## API contract and dependency

CLI 依赖尚待服务端实现/启用的 bearer-authenticated agent API：

- `GET /api/agent/v1/projects/:projectKey/sprints/:sprintId/burndown`
- `GET /api/agent/v1/projects/:projectKey/sprints/:sprintId/tasks`
- `GET /api/agent/v1/github/pull-requests/:owner/:repo/:number`
- `GET /api/agent/v1/lark-tickets/:baseId/:tableId/:recordId`
- `GET /api/agent/v1/odoo/branches?environment=:environment`

每个 endpoint 返回 `{ ok, data, error }`，从 Octo 的同步快照读取。服务端要单独实现 token 生命周期、身份/权限、DTO、快照读取和 controller tests；不能把 Web session cookie 作为 CLI credential。

## 验收标准

- [x] `octo-cli` 可编译，help 与配置/请求构造可由测试覆盖。
- [x] 本地 demo 覆盖 Odoo EU/UK/US 的只读分支/构建状态。
- [x] `agent install` 只复制随包 skill，默认不会覆盖既有目标。
- [x] CLI 和 skill 明确声明不读取 cookie 或第三方 token。
- [x] Tasks 台账有独立 `cli` 模块。
- [ ] Octo server 实现并部署 agent API、token 权限与四个数据 projection endpoint。
- [ ] 使用有效 agent token 对目标环境完成四种读操作的 runtime read-back。

## 验证边界

本次 demo 包含本地 bearer-protected server 和四种 CLI read-back；没有 Octo agent API server 实现、真实 token、目标环境请求或第三方平台 runtime 证明。
