---
title: "Meegle Sprint 历史与详情"
module: "platform-data"
status: completed
created_on: 2026-08-27
updated_on: 2026-08-27
closed_on: 2026-08-27
owner: Codex
related:
  - "TEN-57"
---

# Meegle Sprint 历史与详情

## 目标

基于本地 Meegle 工作项快照增加 Sprint 历史入口；每个 Sprint 可进入工作项列表，并在右侧 Sprint 面板查看进度统计与同口径的标签筛选。

## 验收标准

- [x] 工作台提供 Sprint 历史入口，并按 Sprint 开始时间及最近活动展示已有 Sprint。
- [x] Sprint 详情左侧为该 Sprint 的 Meegle 工作项列表。
- [x] 右侧面板上部展示描述与起止时间区域，中部展示 Scope/Started/Completed 统计，下部沿用原 Meegle 列表的 Sprint、项目、优先级标签筛选。
- [x] 面板按钮控制 Sprint 详情，而不是原列表的标签侧栏。
- [x] FE 单测与构建通过。
- [x] 历史列表和详情页复用按日 Scope / Started / Completed 图表。
- [x] 工作项快照持久化 `item_cycle_tag`、`add_to_cycle_time`、`item_start_time`、`item_finish_time`。
- [x] 生命周期时间从 Meegle 操作记录推导，并覆盖首次加入、开始、完成和重新流转。
- [x] Sprint 根据起止日期按自然日区分 Past、Current、Upcoming；起止当天均计入 Current。
- [x] 历史列表默认只展开 Current Sprint 的按日图表，并允许逐行展开或收起；详情页图表保持常显。

## 背景与范围

改造前 `meegle_workitem_syncs` 只保存工作项关联的 Sprint 名称，没有同步 Sprint 对象自身。本次仍使用同一快照表，但将 Sprint type 作为独立快照对象保存，并从普通工作项列表排除；描述、状态和起止时间来自 Sprint 快照，Scope/Started/Completed 与标签统计来自关联工作项。浏览器不实时读取 Meegle。

## 方案与决策

新增 Sprint 快照语义投影、纯前端聚合模型与两个 hash 路由。同步 adapter 通过集中 fallback config 请求 Sprint 的 description 与 schedule 字段；终态 Sprint 不按普通终态工作项跳过。Server 返回 `sprintDetails`，普通 Meegle 列表查询明确排除 Sprint type。工作项同步额外读取 operation records：当前 Sprint 字段由非当前值变为当前 tag 记为 add；从 Start/New 进入中间状态记为 start；进入 Done/Fixed/Launched 等成功终态记为 finish；Meegle 的镜像状态记录按时间与新状态去重。重新进入 New 会清空 start/finish，完成后重开会刷新 start 并清空 finish。历史与详情共用同一个按日图表，Scope/Started/Completed 分别按 add、尚未 finish 的 start、finish 时间统计。Sprint 生命周期只由 schedule 起止自然日推导，不以平台状态名或工作项完成率代替；缺少足够日期时显示日期未同步。历史列表使用单开式展开，首次加载选择排序结果中的 Current Sprint。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-27 | in_progress | 已确认现有 API 仅投影 Sprint 名称，并开始实现历史聚合与详情 UI。 | 完成路由、页面、样式和验证。 |
| 2026-08-27 | completed | 已在现有 Octo FE SPA 中增加 `#meegle-sprints` 与详情深链；Server 同步并投影真实 Sprint 状态、描述和 schedule；右侧 Sprint 面板包含进度图和标签筛选。67 项 FE 单测、561 项 Server 测试及两端构建通过。 | 部署配置需加入 Sprint type 并完成首次同步；未做登录态浏览器视觉验收。 |
| 2026-08-27 | in_progress | 追加按日生命周期图表需求。只读实测确认 operation records 可识别 Sprint 字段赋值及状态变化的毫秒时间。 | 实现生命周期投影、落库和两处图表。 |
| 2026-08-27 | completed | 操作记录 adapter、生命周期投影、四字段数据库/API 契约和共用按日阶梯图已完成；服务端 569 项测试、FE 70 项测试及两端构建通过。 | 未在目标数据库执行迁移/首次同步；未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | Sprint 起止日期现按包含边界的自然日推导 Past/Current/Upcoming；历史列表默认展开 Current，并可逐行展开/收起图表。FE 72 项测试及 Vite build 通过。 | 未做登录态浏览器视觉验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测 / 构建 | 通过 | `pnpm check`：72/72 tests passed；Vite build passed。 | 尚未做登录态浏览器视觉验收。 |
| Server 单测 / 构建 | 通过 | 完整 Vitest：569/569 tests passed；TypeScript build passed。 | 未在目标数据库执行迁移和首次 Sprint 全量同步。 |
| Meegle 只读元数据与操作记录验证 | 通过 | 真实 `meta-types`、Sprint `meta-fields`、MQL、`+batch-get` 与 `list-op-records` 确认 Sprint 字段赋值、状态流转及毫秒时间结构。 | 未写 Meegle；未把返回正文写入持久文档。 |

## 关联

- `fe/src/pages/MeegleSprintPages.jsx`
- `fe/src/lib/meegle-sprint-history.js`
