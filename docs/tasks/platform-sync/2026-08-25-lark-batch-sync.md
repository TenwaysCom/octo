---
title: "Lark Ticket List 同步、批量写入与清洗"
module: "platform-sync"
status: done
created_on: 2026-08-25
updated_on: 2026-08-25
closed_on: 2026-08-25
owner: TBD
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# Lark Ticket List 同步、批量写入与清洗

## 目标

让 Lark Ticket full/incremental 直接消费 Bitable List records，单条/多选按 ID 使用 `batch_get`；所有路径继续批量写入快照和清洗投影。

不在本次范围内：改 Meegle/GitHub 同步；修改 Lark Base 源端记录；改变 checkpoint 或终态过滤语义。

## 验收标准

- [x] full/incremental 的 List 请求读取完整 records 和自动时间字段，不再重复调用 Batch Get。
- [x] 单条/多选按每批最多 100 个 ID 调用 `batch_get`；forbidden、absent 或漏返回记录会使操作失败。
- [x] Lark 快照 UPSERT、清洗输入读取与清洗字段更新使用批量 store 接口。
- [x] Server 相关单测和 build 通过。
- [x] 真实同步验证边界已明确记录，不把旧 Batch Get 路径的结果当作当前 List 直写路径的验证。

## 背景与范围

原增量同步先用 List 找候选，再逐条调用 Get；快照与清洗也逐条访问数据库。真实候选数量上升时会形成平台和数据库 N+1，导致 Web 请求在 Server 完成前超时。List 已返回同步需要的完整 records，因此 full/incremental 不需要再按 ID 重读。

## 方案与决策

- full/incremental 的 List 传 `automatic_fields=true`，直接以返回 records 写快照，并用 `last_modified_time` 推进 Lark checkpoint。
- 单条/多选因输入是 record IDs，按 100 条调用 `batch_get(automatic_fields=true)`。
- Batch Get 结果必须完整；权限拒绝、已删除或未返回对象不静默跳过。
- 本地 UPSERT 与清洗按 500 条分批，避免 PostgreSQL 参数上限。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-25 | in_progress | 已确认现有 service、Lark adapter、PostgreSQL store 与同步 CLI 边界，开始实现批量链路。 | 补测试、构建与真实同步。 |
| 2026-08-25 | superseded | 曾将 Lark 单条、多选、full、incremental 统一改为每批 100 条 Batch Get；快照与清洗 store 已批量化。真实 full 同步成功：listed=1878、skipped_inactive=1709、synced=169、cleaned=147、stale=1616。 | 后续核对接口研究后确认 full/incremental 可直接消费 List records，重复 Batch Get 方案被本任务后续进展替代。 |
| 2026-08-25 | done | full/incremental 已直接消费分页 List records，并保留自动时间字段、终态过滤、缺失时间 fail closed、批量 UPSERT 与批量清洗；单条/多选继续使用 Batch Get。59 个相关测试和 Server build 通过。 | 未用调整后的 List 直写路径重跑真实 Lark full；此前真实同步结果仅验证被替代的 Batch Get 路径。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 相关单测 | 通过 | `59 passed`：Lark adapter、PlatformSyncService、Postgres store、CLI 与 Web sync controller | mock/pg-mem，不证明外部授权 |
| Server build | 通过 | `pnpm --dir server build` | TypeScript 静态验证 |
| Server 全量测试 | 有既有环境失败 | 最近一次运行仍有 6 个 suite 缺 `node:sqlite`，logger 文件时序断言失败 | 本次相关测试全部通过；未在修正测试夹具后再次跑全量 |
| Lark full 同步 | 历史路径通过 | `listed=1878 skipped_inactive=1709 synced=169 cleaned=147 stale=1616`，exit 0 | 验证的是已替代的 Batch Get 路径；当前 List 直写路径未做真实授权验证 |

## 关联

- [平台同步说明](../../tenways-octo/it-platform-sync.md)
