---
title: "Meegle 工作项 Sprint 标签聚合统计"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-09-03
updated_on: 2026-09-03
closed_on: 2026-09-03
owner: TBD
related:
  - "/#meegle-workitems"
  - "2026-08-27-meegle-sprint-ui.md"
  - "../platform-sync/2026-08-27-list-view-kanban-and-grouping.md"
---

# Meegle 工作项 Sprint 标签聚合统计

## 目标

让 `/#meegle-workitems` 的 Sprint 标签筛选读取独立 Sprint 快照与成员历史，按 Sprint 名称自然倒序展示，并将同名 Sprint 的进度统计合并到标签信息中。筛选请求仍使用既有 Sprint 名称值，不修改 Server、同步或数据库契约。

## 验收标准

- [x] 页面只在 Meegle 工作项入口读取 `/api/web/meegle-sprints`，开发环境重复挂载共享同一个在途请求。
- [x] Sprint 筛选项合并工作项标签计数、已知 Sprint 名称和 Sprint 历史摘要。
- [x] 同名 Sprint 的 Scope、完成、进行中和未开始统计相加，并重新计算完成率。
- [x] Sprint 标签及筛选弹层按名称自然倒序展示。
- [x] 标签展示 Sprint 状态、完成数/Scope、完成率和当前列表命中数；长内容保留完整 title。
- [x] Sprint 数据读取失败时保留现有名称与工作项计数筛选能力。
- [x] FE 测试和 production build 通过。

## 背景与范围

工作项列表接口只返回当前工作项、Sprint 名称集合和分页信息；右侧标签此前仅从当前已加载工作项计算数量并按数量排序。独立 Sprint 接口已经提供 Sprint metadata 与连续成员区间，可复用 `buildMeegleSprintHistory` 生成 Scope/完成统计。本任务不把历史明细重新塞入工作项列表响应。

## 方案与决策

新增纯函数按名称合并 Sprint 历史摘要和现有 tag count。同名 Sprint 的统计求和后重新计算完成率，并保留合并的 Sprint 数和项目数。工作项页面单独加载 Sprint 历史，失败时传空摘要进入同一纯函数，自动退化为名称与计数列表。标签 value 始终是名称，以兼容现有 Server `sprint` 过滤协议。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-03 | v1 | in_progress | 已实现 Sprint 历史读取、同名统计聚合、名称倒序和标签副信息；聚焦测试通过。 | 运行 FE 全量测试和 build；未执行登录态浏览器视觉验收。 |
| 2026-09-03 | v1 | done | Sprint 标签已合并快照统计与当前列表计数，两个筛选入口均按名称自然倒序；在途请求去重与失败降级已覆盖。FE test/build 通过。 | 未执行登录态浏览器视觉验收；当前列表计数只代表已加载结果，Sprint 完成统计来自完整成员历史。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 聚焦测试 | 通过 | Sprint history 与 platform-data API 两个测试文件通过。 | 纯函数/API 契约，不覆盖浏览器视觉。 |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：31/31 个测试文件通过。 | Node 单测不覆盖登录态浏览器视觉。 |
| FE production build | 通过 | `pnpm --dir fe build`：Vite 处理 63 个模块并成功生成 assets。 | 未部署或重启 FE 服务。 |

## 关联

- `fe/src/pages/PlatformListPage.jsx`
- `fe/src/lib/meegle-sprint-history.js`
- `fe/src/services/platform-data/platform-data-api.js`
- `fe/src/styles/global.css`
