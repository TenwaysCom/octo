---
title: "Meegle 当前节点开始时间同步"
module: "platform-sync"
status: done
requirement_version: 1
created_on: 2026-08-28
updated_on: 2026-08-28
closed_on: 2026-08-28
owner: Codex
related:
  - "meegle_workitem_syncs"
---

# Meegle 当前节点开始时间同步

## 目标

将 Meegle work item detail 中当前节点的 `actual_begin_time` 标准化并同步为 PostgreSQL 快照的 `current_node_start_time`，供本地 API 和后续 UI 直接读取。

不将它与 `item_start_time` 混用：前者是当前节点的开始时间，后者是工作项最早进入非 New 节点的生命周期开始时间。

## 验收标准

- [x] 正常全量和增量同步将当前节点的 `actual_begin_time` 写入 `meegle_workitem_syncs.current_node_start_time`。
- [x] 源端没有当前节点时间时写入 `null`，不保留过期节点时间。
- [x] 列表和按 ID 查询返回 `currentNodeStartTime`。
- [x] 生命周期与 PostgreSQL store 的定向测试通过。

## 方案与决策

仅使用正常同步已取得的 work item detail，不增加 Meegle API 请求。字段读取路径为 `fields.work_item_current_node[0].actual_begin_time`，同时兼容现有解析器支持的嵌套 `schedule.actual_begin_time` 形态。现有库通过 `ensurePostgresSchema()` 增列；历史快照将在后续同步或 PG-only 清洗时更新。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-28 | v1 | done | 新增 snapshot 列和 API 投影；Feature、Tech Task、Production Bug 共用 `work_item_current_node[0].actual_begin_time` 映射。 | 未执行真实 Meegle 同步或目标 PostgreSQL 写入。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 定向测试 | 通过 | `pnpm --dir server exec vitest run`：4 files、56 tests passed。 | mock/pg-mem 验证，不等同于真实 Meegle 同步。 |
| Server 全量测试 | 通过 | `pnpm --dir server test`：129 files、596 tests passed。 | 运行于本地测试环境。 |
| Server build | 通过 | `pnpm --dir server build`。 | 未执行目标 PostgreSQL schema migration。 |
