---
title: "Meegle 工作项与 Sprint 页面性能优化"
module: "platform-data"
status: done
requirement_version: 3
created_on: 2026-08-29
updated_on: 2026-09-25
closed_on: 2026-09-25
owner: Codex
related:
  - "docs/tasks/platform-data/2026-08-27-meegle-sprint-history.md"
---

# Meegle 工作项与 Sprint 页面性能优化

## 目标

缩短 Meegle 工作项与 Sprint 首屏阻塞路径。工作项与 Sprint 继续先读取本地数据；Meegle 工作项及 Sprint 详情页通过一次 `/api/web/github-pr-odoo-devops-build?all=true` 获取 EU/UK/US 全部分支构建状态，所有 PR 共用结果，不再逐 PR 请求。列表当前最大 1000 条，分页沿用现状。

## 验收标准

- [x] `#meegle-workitems` 只读取当前页本地工作项、总数、Sprint 筛选项和本地 PR 摘要，分页沿用当前上限 1000。
- [x] `#meegle-sprints` 使用独立接口读取本地 Sprint 快照和归属历史，不再依赖逐页工作项列表。
- [x] Meegle 页面一次批量请求返回三环境安全构建投影；冷缓存在该请求内等待环境级单飞刷新，不逐 PR 轮询。
- [x] Redis 不可用时使用进程内 30 分钟 TTL；已有过期快照先返回旧值并后台刷新。
- [x] 工作项和 Sprint 详情共用页面构建数据，分组展开/筛选/重渲染不重复请求；环境部分失败与无 headRef 不触发单 PR 回退请求。
- [x] 原单 PR GET 保持兼容，含 202 refreshing；批量请求要求现有 Web session，校验参数并保留 actionRunId 和安全诊断。

## 背景与范围

上游 Odoo DevOps 分支接口只能返回一个环境的完整分支快照，不能按 repo、PR 或分页增量请求。因此 repo 仅用于映射环境，不能作为刷新或缓存单位。没有改变 GitHub PR 普通列表的既有构建状态路径，也没有添加 PostgreSQL 持久化缓存。

## 方案与决策

v3：在现有 GET 上增加 `all=true&actionRunId=...` 批量模式；服务按环境复用 Redis/内存缓存和刷新，已有旧快照立即返回并后台刷新，冷缓存等待本次刷新完成。每环境只返回 branch/status/result、state、stale 及安全错误诊断，不返回原始上游快照。FE 页面 Provider 请求一次并索引环境/分支，状态组件只消费上下文；无 headRef 或无映射仓库显示不可用，无匹配分支显示无构建。请求失败不自动轮询，刷新页面重试。

v1/v2 按 PR 请求与冷缓存 FE 轮询方案对 Meegle 页面已被 v3 替代；旧单 PR 接口保留兼容。v1/v2 的 500 条分页已被既有列表分页任务更新为 1000 条，本轮不改分页。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-29 | v1 | done | 拆分 Meegle 工作项/Sprint Web 契约，加入环境级 Odoo 异步刷新和 FE 按需状态组件；分组配置默认折叠。 | 未在登录态浏览器或真实 Odoo DevOps/Redis 上做运行时测速。 |
| 2026-08-29 | v2 | done | 移除手动“查看构建状态”；可见的关联 PR 在组件挂载后自动异步读取，并仅在冷缓存 `202` 时轮询。 | 未在登录态浏览器或真实 Odoo DevOps/Redis 上做运行时测速。 |
| 2026-09-25 | v3 | in_progress | 用户要求 Meegle 页面一次构建状态请求获取全部数据；已复核逐 PR 请求来源并重开受影响验收项。保留前一任务未提交的 FE 懒加载变更。 | 实现批量模式、页面共享状态和针对性验证；历史 v1/v2 证据不作为 v3 验收依据 |
| 2026-09-25 | v3 | done | 增加 all=true 批量 GET、环境级冷缓存等待及部分失败投影；Meegle 页面 Provider 共享请求和状态。浏览器 mock 中 12 条关联 PR 仅 1 次请求，展开/筛选/面板重渲染不增加请求。 | 未部署；未做真实 Redis/Odoo/GitHub/Lark E2E。既有入口 .env 测试失败单独记录如下 |

## 验证

### v3（2026-09-25）

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 / 构建 | 通过 | `git diff --check`；`pnpm --dir server build`；FE check 中的 production build；日志 `/tmp/octo-meegle-builds-server-build.log`、`/tmp/octo-meegle-builds-fe-check.log` | 未部署；FE 保持页面拆包，无 500 kB 告警 |
| FE 单测 | 通过 | `pnpm --dir fe check`：46 个测试文件通过；新增一次请求合并、actionRunId、错误响应校验、环境/分支匹配、stale/空构建/不可用断言 | Node 测试，无真实平台 |
| Server 定向单测 | 38/39 通过；1 项既有失败 | `NODE_OPTIONS=--experimental-sqlite pnpm --dir server exec vitest run src/application/services/odoo-devops-branches.service.test.ts src/modules/github-pr-odoo-devops-build/github-pr-odoo-devops-build.controller.test.ts src/index.test.ts src/http/api-auth.test.ts`；`/tmp/octo-meegle-builds-server-test.log` | 服务 15 项、控制器 11 项、鉴权 9 项、路由 3 项通过；入口 .env 日志子进程测试未通过；未跑 Server 全量套件 |
| 浏览器 mock | 4 组通过 | `/tmp/octo-meegle-builds-browser.mjs`；结果 `/tmp/octo-meegle-builds-browser-result.json` | 本地 Chromium + production dist，合成工作项/PR/环境状态，外部平台请求被拦截 |
| 真实平台 / 部署后验证 | 未执行 | 无部署操作 | 不宣称真实平台性能或生产已生效 |

Server `loads .env before eagerly constructing loggers in the real entry point` 期望 `ENTRY_LOG_LEVEL=debug`，实际子进程 stdout 为空；单独重跑仍失败（`/tmp/octo-meegle-builds-entry-recheck.log`）。相同失败已记录于 [API health 任务](../engineering-ops/2026-09-14-api-health-route.md)，本次未修改入口初始化或顺带修复该问题。

浏览器验收使用 12 条合成工作项和关联 PR：

1. 延迟批量响应时列表先显示、构建显示加载中；放行后同名分支按 EU/UK 区分 success/failed，US 失败显示不可用，缺失分支显示无构建，旧快照带旧数据提示。
2. 列表分组收起/展开及 Story 筛选后仍只有一次批量请求；无 headRef 和未映射 repo 不发送单 PR 请求。
3. Sprint 详情所有 PR 共用一次请求；切换详情面板不重新请求。
4. 整次批量请求返回 503 后不自动轮询或逐 PR 回退；GitHub 列表不启用该批量请求。

浏览器脚本首次误用“隐藏 Sprint 详情”按钮名（现有按钮始终标记“显示 Sprint 详情”）导致定位超时；修正为实际 aria-label 后四组通过。此为测试脚本定位问题，不修改产品文案。

### v1/v2 历史证据

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 定向测试 | 通过 | 6 文件、38 项：平台数据、环境缓存、Web 控制器、路由与鉴权。 | mock，不访问 Redis、GitHub 或 Odoo DevOps。 |
| FE API 定向测试 | 通过 | `platform-data-api.test.js` 16 项，覆盖独立 Sprint 接口和 202 刷新响应。 | 未覆盖 React 视觉交互。 |
| 全量测试 | 通过 | `pnpm --dir server test`：131 文件、611 项；`pnpm --dir fe test`：93 项。 | 测试使用 mock/本地测试存储。 |
| 构建 | 通过 | `pnpm --dir server build`；`pnpm --dir fe build`。 | 构建不能证明真实接口耗时。 |

## 关联

- `docs/ai-dev/lifecycle/current-system-technical-objects.md`
- `docs/tasks/platform-data/2026-08-27-meegle-sprint-history.md`
