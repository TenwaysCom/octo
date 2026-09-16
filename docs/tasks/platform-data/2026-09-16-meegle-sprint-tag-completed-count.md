---
title: "Meegle Sprint 标签完成数量排查"
module: "platform-data"
status: done
requirement_version: 2
created_on: 2026-09-16
updated_on: 2026-09-16
closed_on: 2026-09-16
owner: Codex
related:
  - "2026-08-27-meegle-sprint-history.md"
---

# Meegle Sprint 标签完成数量排查

## 目标

解释 Meegle 工作项列表标签筛选中 20260903 Sprint 显示 18/28 的原因，并在 FE 普通工作项列表区分 Launched 下的 Go-Live check 与 Finished。保持统计口径、API 和平台数据不变。

## 验收标准

- [x] 追踪标签统计的数据来源和完成判定。
- [x] 核对 20260903 的安全聚合数据，解释差额并明确验证边界。
- [x] Launched 且有当前节点时，在状态徽标直接显示节点；Go-Live check 使用检查态样式。
- [x] Launched 且无当前节点、有有效完成时间时显示 Launched · Finished；缺少节点和时间时不推断完成。
- [x] 相关单测与 FE 构建通过。

## 方案与决策

- 对照当前列表快照、Sprint 归属记录和 Sprint 截止日期，只读查询，输出状态、日期和数量，不输出原始 payload 或凭据。
- 标签摘要使用 `buildMeegleSprintHistory` 的归属历史统计，与当前工作项状态和列表右侧项数来源不同。
- v1 原“普通列表按当前状态完成数展示”建议已撤回：Launched 可包含 Go-Live check，不能直接视为流程完成。
- v2 按用户要求调整 FE 展示：普通列表/表格使用已返回的 subStage 与 itemFinishTime 区分 Launched；节点优先，避免仍有检查节点时被旧完成时间覆盖。只有状态名称的其他入口使用上线样式，不再仅凭 Launched 显示已完成色。无需新增数据或改变筛选、分组、Sprint 统计。

## 排查结果

项目配置 PostgreSQL 的只读事务查询，复用现有 Store、Server Sprint 投影和 FE 汇总，复现 `Odoo Sprint 20260903` 的 `scope=28, completed=18, started=10, completionPercent=64`。

- Sprint 配置结束时间为 `2026-09-03T15:59:59.000Z`；FE 使用 `endOfUtcDay` 将实际统计截止扩展到该 UTC 日结束。本次统计结果为 18，时区边界是否符合产品要求不在本次判断范围。
- 共读取到该 Sprint 的 39 段归属记录，其中 28 段属于截止时 Scope。
- 18 条完成时间在统计截止前，计入完成。
- 4 条在截止后完成：9 月 7 日 2 条、9 月 8 日 1 条、9 月 11 日 1 条，未计入完成。
- 4 条当前状态为 Launched，但历史归属的 `itemFinishTime` 缺失，来源均为 `historical_inferred`，未计入完成。没有真实源端查询，不能据此断言 Meegle 原始完成字段缺失或同步映射失败。
- 后续只读核对确认上述 4 条 ID 为 `14030839`、`14031867`、`14061088`、`14240352`；当前工作项快照的 `item_finish_time` 也均为 null，并非仅历史归属缺失。
- 2 条截止时在 Scope，之后已移出；历史归属无完成时间，当前状态为 In development，未计入完成。
- 当前快照仍归属该 Sprint 的是 26 条：Done 10、Fixed 11、Launched 5。此前将这些统一称为“当前完成态”不准确：Launched 5 条中 4 条仍处于 Go-Live check，不能仅凭状态名称确认流程完成。历史 28 与当前 26 属于不同集合。

根因：普通列表 Sprint 标签复用了历史归属的截止时完成统计，UI 简写为“完成”，未说明统计截止和缺失时间；因此无法与当前列表的完成状态直接对应。归属数据存在时 `getWorkitemProgress` 只看时间，不会用当前完成状态兜底，这是避免后来完成反向改写历史的既有行为。

### 状态映射追查

用户追问 Go-Live check 与 Finished 为什么都显示 Launched。只读提取已存响应中的状态白名单字段后确认：

- 上述 4 条的源响应 `work_item_attribute.work_item_status` 都是 `key=sub_stage_1682410371762, name=Launched`；当前流程节点为 `id=state_37, name=Go-Live check`。
- 数据库分别保存 `status=Launched` 与 `sub_stage=Go-Live check`；映射表也分开保存 `status` 和 `sub_stage` 两种映射，没有将 `state_37` 映射为 Launched。
- 同 Sprint 的 `14164824` 也有相同源状态 Launched，但无当前节点，且完成时间为 `2026-09-01`。未凭空把其原始状态字段称为 Finished。
- 4 条 Go-Live check 的保存响应没有 `finish_time` 字段，支持“流程仍在检查节点”解释；不能再将其简单描述为已完成但同步遗漏时间。
- `meegle-shell-client.ts` 的 `toDetailedWorkitem` 分别从工作项状态和当前节点读取 `status` 与 `subStage`；`platform-sync.service.ts` 分别缓存/应用这两种映射。
- FE `getMeegleStatusTone` 仅凭 Launched 赋予 completed 样式，列表行把节点放在状态 tooltip 中；这一展示容易让检查中的工作项看起来已完成。Sprint 时间统计不使用该样式判定。

结论：Launched 是源响应提供的状态名称，Go-Live check 是另一字段中的流程节点；不能把 Launched 与流程 Finished 等同。此次未调用真实 Meegle API，以上依据均为已保存源响应和当前代码。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-16 | v1 | in_progress | 已定位 FE 标签计算入口；用户确认 20260903 为 28 条已完成、摘要为 18 条。 | 核对数据库归属时间与截止日期。 |
| 2026-09-16 | v1 | done | 只读数据库查询与现有汇总函数复现 18/28，差额分解为 4 条延期完成、4 条 Launched 缺少归属完成时间、2 条后来移出且当前仍开发中。 | 未访问真实 Meegle、未运行登录态浏览器；未修改应用代码或数据。 |
| 2026-09-16 | v1 | done | 追查状态映射：4 条的源状态 Launched、当前节点 Go-Live check，映射分别保存；纠正此前“Launched 即已完成”的判断并撤回按状态名称直接统计完成的建议。 | 依据数据库保存的源响应；未查询实时 Meegle、未修改代码。 |
| 2026-09-16 | v2 | done | 用户要求 FE 区分两者；普通工作项列表/表格显示 `Launched · Go-Live check`（review）或 `Launched · Finished`（completed）。仅有 Launched 状态时使用 release 色；不改变原始状态、筛选、分组和 Sprint 统计。`pnpm --dir fe check` 与差异检查通过。 | 未做登录态浏览器验收或部署。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 已完成 | 统计链路和状态展示调用点已核对，`git diff --check` 通过 | 没有跨层契约变化。 |
| 数据库只读核对 | 已完成 | `SET TRANSACTION READ ONLY` 内读取项目配置数据库，通过 `PostgresPlatformSyncStore`、`buildMeegleSprintWorkitemProjections` 和 `buildMeegleSprintHistory` 复现；安全聚合结果见上文 | 本地已同步快照，不等同真实 Meegle 当前状态。 |
| 单测 | 通过 | `pnpm --dir fe check` 的 test 阶段通过，报告 41 个测试文件；补充 Go-Live check、Finished、过时完成时间和缺失证据回归场景 | 本地单测，无真实 API 调用。 |
| 构建 | 通过 | `pnpm --dir fe check` 的 Vite build 阶段通过 | 构建通过不等于部署生效。 |
| Live E2E / 部署运行时 | 未执行 | 无登录态浏览器验收、无部署 | 不宣称已修复上线。 |

## 关联

- [Sprint 历史与详情](2026-08-27-meegle-sprint-history.md)
