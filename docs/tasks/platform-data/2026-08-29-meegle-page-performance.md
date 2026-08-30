---
title: "Meegle 工作项与 Sprint 页面性能优化"
module: "platform-data"
status: done
requirement_version: 2
created_on: 2026-08-29
updated_on: 2026-08-29
closed_on: 2026-08-29
owner: Codex
related:
  - "docs/tasks/platform-data/2026-08-27-meegle-sprint-history.md"
---

# Meegle 工作项与 Sprint 页面性能优化

## 目标

缩短 `#meegle-workitems` 和 `#meegle-sprints` 的首屏阻塞路径。工作项接口维持每页 500 条，不再同时计算 Sprint 历史或同步读取 Odoo.sh；Sprint 页面使用独立本地历史接口。关联 PR 的 Odoo.sh 构建状态在组件挂载后按环境异步读取。设置 Group by 或 Subgroup 后，分组默认折叠。

## 验收标准

- [x] `#meegle-workitems` 只读取当前页本地工作项、总数、Sprint 筛选项和本地 PR 摘要，分页上限保持 500。
- [x] `#meegle-sprints` 使用独立接口读取本地 Sprint 快照和归属历史，不再依赖逐页工作项列表。
- [x] Odoo.sh 刷新、缓存和单飞合并只按 `eu`、`uk`、`us` 划分；冷缓存返回 `202 refreshing`。
- [x] Redis 不可用时使用进程内 30 分钟 TTL；已有过期快照先返回旧值并后台刷新。
- [x] Meegle 工作项和 Sprint 详情的 PR 构建状态自动异步加载；主分组及子分组在配置变更时默认折叠。

## 背景与范围

上游 Odoo DevOps 分支接口只能返回一个环境的完整分支快照，不能按 repo、PR 或分页增量请求。因此 repo 仅用于映射环境，不能作为刷新或缓存单位。没有改变 GitHub PR 普通列表的既有构建状态路径，也没有添加 PostgreSQL 持久化缓存。

## 方案与决策

`PlatformDataService.list("meegle-workitems")` 只走本地快照查询；`listMeegleSprintHistory()` 专供 `/api/web/meegle-sprints`。Odoo 分支服务以环境维护 Redis 加进程内快照及单飞刷新；构建状态接口允许 FE 传入已同步的 `headRef`，从而避免为该点击额外读取 GitHub。缺少 `headRef` 时保持已有 GitHub 查询兼容。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-29 | v1 | done | 拆分 Meegle 工作项/Sprint Web 契约，加入环境级 Odoo 异步刷新和 FE 按需状态组件；分组配置默认折叠。 | 未在登录态浏览器或真实 Odoo DevOps/Redis 上做运行时测速。 |
| 2026-08-29 | v2 | done | 移除手动“查看构建状态”；可见的关联 PR 在组件挂载后自动异步读取，并仅在冷缓存 `202` 时轮询。 | 未在登录态浏览器或真实 Odoo DevOps/Redis 上做运行时测速。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 定向测试 | 通过 | 6 文件、38 项：平台数据、环境缓存、Web 控制器、路由与鉴权。 | mock，不访问 Redis、GitHub 或 Odoo DevOps。 |
| FE API 定向测试 | 通过 | `platform-data-api.test.js` 16 项，覆盖独立 Sprint 接口和 202 刷新响应。 | 未覆盖 React 视觉交互。 |
| 全量测试 | 通过 | `pnpm --dir server test`：131 文件、611 项；`pnpm --dir fe test`：93 项。 | 测试使用 mock/本地测试存储。 |
| 构建 | 通过 | `pnpm --dir server build`；`pnpm --dir fe build`。 | 构建不能证明真实接口耗时。 |

## 关联

- `docs/ai-dev/lifecycle/current-system-technical-objects.md`
- `docs/tasks/platform-data/2026-08-27-meegle-sprint-history.md`
