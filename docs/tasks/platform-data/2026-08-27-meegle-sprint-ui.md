---
title: "Meegle Sprint 历史与详情 UI"
module: "platform-data"
status: done
requirement_version: 3
created_on: 2026-08-27
updated_on: 2026-08-28
closed_on: 2026-08-28
owner: Codex
related:
  - "TEN-57"
  - "docs/tasks/platform-data/2026-08-27-meegle-sprint-history.md"
---

# Meegle Sprint 历史与详情 UI

## 目标

Sprint 历史列表不再提供视图配置或筛选；Sprint 详情页提供视图配置和筛选，且两者只作用于该 Sprint 的工作项。该任务只处理页面内展示状态，不改变 Sprint 数据同步、生命周期清洗或归属历史规则。

## 验收标准

- [x] Sprint 历史页不展示视图配置、分组或筛选控件，并保持日期倒序和默认展开 Current Sprint。
- [x] Sprint 详情工具栏展示互斥的“视图配置”和“筛选”模块，并支持 Escape 关闭。
- [x] 视图配置只影响当前 Sprint 工作项的分组、子分组、列和排序，不影响 Sprint 概览或图表。
- [x] 筛选仅根据当前 Sprint 工作项的类型、状态、项目、优先级和负责人匹配，支持多选和清空。
- [x] FE 单元测试和 production build 通过。

## 背景与范围

Sprint 历史与详情页面已经存在。需求已从“在历史列表提供筛选/分组”调整为“列表不提供这两项，详情页针对 work item 提供视图配置和筛选”。所有状态仍仅存在于 FE 页面，不新增 Server 查询参数，不访问 PostgreSQL 或 Meegle。

## 方案与决策

v1 的历史列表筛选/分组决策已 superseded。v2 的列/排序视图配置由 v3 扩展为 Group by、Sub group by、列和排序；筛选控制类型、状态、项目、优先级和负责人。二者均在当前 Sprint 的已加载 work item 集合上执行。配置归一化、排序与分组保持在独立纯函数中，便于单测。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-27 | v1 | completed | Sprint 历史列表补齐 Group / Filter 图标；支持生命周期多选筛选以及时间线/生命周期分组，保留默认展开 Current Sprint 和详情 panel 行为。 | 未执行登录态浏览器视觉验收。 |
| 2026-08-28 | v2 | in_progress | 需求改为列表移除视图配置/筛选，详情页仅针对 work item 提供两项能力；v1 的相关完成证据不再作为当前验收依据。 | 待完成实现与 FE 验证。 |
| 2026-08-28 | v2 | done | 列表页移除视图配置与筛选；详情页新增只作用于当前 Sprint work item 的列/排序配置和类型、状态、项目、优先级、负责人筛选。 | 未执行已登录浏览器视觉验收。 |
| 2026-08-28 | v3 | in_progress | 视图配置补充 Group by 与 Sub group by，作用域保持为当前 Sprint 的 work item。 | 待完成 FE 验证。 |
| 2026-08-28 | v3 | done | 详情页视图配置支持按类型、状态、项目、优先级或负责人主分组与子分组；子分组不允许重复主分组，分组可折叠。 | 未执行已登录浏览器视觉验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测 / 构建（v1，历史） | 通过 | `pnpm --dir fe check`：75/75 tests passed；Vite production build passed。 | 该证据不覆盖 v2 要求。 |
| FE 单测 / 构建（v2） | 通过 | `pnpm --dir fe check`：83/83 tests passed；Vite production build passed。新增 Sprint work item 视图配置归一化与排序覆盖。 | 未执行登录态浏览器视觉验收。 |
| FE 单测 / 构建（v3） | 通过 | `pnpm --dir fe check`：84/84 tests passed；Vite production build passed。新增主分组/子分组组合和非法配置归一化覆盖。 | 未执行登录态浏览器视觉验收。 |
| 外部资源 | 未使用 | 本次只修改 FE、纯函数测试和任务文档。 | 没有 PostgreSQL 或 Meegle 运行时证据。 |

## 关联

- `fe/src/pages/MeegleSprintPages.jsx`
- `fe/src/lib/meegle-sprint-history.js`
- `fe/src/lib/meegle-sprint-workitem-view.js`
- `fe/src/lib/meegle-sprint-history.test.js`
- `fe/src/styles/global.css`
- `docs/tasks/platform-data/2026-08-27-meegle-sprint-history.md`
