---
title: "Lark Ticket 批量拉取、写入与清洗"
module: "platform-sync"
status: done
created_on: 2026-08-25
updated_on: 2026-08-25
closed_on: 2026-08-25
owner: TBD
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# Lark Ticket 批量拉取、写入与清洗

## 目标

将 Lark Ticket 单条、多选、全量与增量同步统一到 Bitable `batch_get` 拉取，并批量写入快照和清洗投影；完成代码验证后，对配置中的 Lark Base 执行一次真实同步。

不在本次范围内：改 Meegle/GitHub 同步；修改 Lark Base 源端记录；改变 checkpoint 或终态过滤语义。

## 验收标准

- [x] Lark 记录按每批最多 100 个 ID 调用 `batch_get`，并请求自动时间字段。
- [x] forbidden、absent 或漏返回记录会使当前 scope 失败，不推进 checkpoint。
- [x] Lark 快照 UPSERT、清洗输入读取与清洗字段更新使用批量 store 接口。
- [x] Server 相关单测和 build 通过。
- [x] 配置中的 Lark Base 完成一次真实同步，并仅记录脱敏计数与验证边界。

## 背景与范围

当前增量同步先用 List 找候选，再逐条调用 Get；快照与清洗也逐条访问数据库。真实候选数量上升时会形成平台和数据库 N+1，导致 Web 请求在 Server 完成前超时。

## 方案与决策

- List 仍用于 full 枚举和 incremental 源端过滤；枚举出的 ID 再按 100 条调用 `batch_get`。
- `batch_get` 传 `automatic_fields=true`，并以批量详情中的 `last_modified_time` 推进 Lark checkpoint。
- 批量结果必须完整；权限拒绝、已删除或未返回对象不静默跳过。
- 本地 UPSERT 与清洗按 500 条分批，避免 PostgreSQL 参数上限。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-25 | in_progress | 已确认现有 service、Lark adapter、PostgreSQL store 与同步 CLI 边界，开始实现批量链路。 | 补测试、构建与真实同步。 |
| 2026-08-25 | done | Lark 单条、多选、full、incremental 已统一走每批 100 条的 Batch Get；快照与清洗 store 已批量化。58 个相关测试与 build 通过；真实 full 同步成功：listed=1878、skipped_inactive=1709、synced=169、cleaned=147、stale=1616。 | 全量 Server test 的 510 个测试通过；6 个 SQLite suite 因 Node 22.12.0 缺少 `node:sqlite` 无法加载，logger 轮转测试仍有既有时序失败。未做 UI/部署后 Web 触发验证。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 相关单测 | 通过 | `58 passed`：Lark adapter、PlatformSyncService、Postgres store、CLI 与 Web sync controller | mock/pg-mem，不证明外部授权 |
| Server build | 通过 | `pnpm --dir server build` | TypeScript 静态验证 |
| Server 全量测试 | 有既有环境失败 | `510 passed`；6 个 suite 缺 `node:sqlite`，1 个 logger 文件时序断言失败 | 本次相关测试全部通过 |
| Lark full 同步 | 通过 | `listed=1878 skipped_inactive=1709 synced=169 cleaned=147 stale=1616`，exit 0 | 真实 Lark/PostgreSQL；未输出记录内容或凭据，未从 Web 页面触发 |

## 关联

- [平台同步说明](../../tenways-octo/it-platform-sync.md)
