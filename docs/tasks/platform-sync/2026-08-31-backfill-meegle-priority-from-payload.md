---
title: "从 Meegle payload 回填 Priority"
module: "platform-sync"
status: done
requirement_version: 3
created_on: 2026-08-31
updated_on: 2026-08-31
closed_on: 2026-08-31
owner: Codex
related:
  - "2026-08-27-list-view-kanban-and-grouping.md"
---

# 从 Meegle payload 回填 Priority

## 目标

先仅使用 PostgreSQL `meegle_workitem_syncs.payload_json` 中已经持久化的证据，为 Story、Tech Task 和 Production Bug 快照回填标准 `priority` 投影；随后让全量和增量 MQL 同步稳定选择 Priority、解析枚举 label，并在 batch detail 缺少该值时保留 MQL 投影。最后让 batch-get 按类型显式请求 Tech Team，使后续 payload 保存可供独立清洗使用的原始字段。

## 验收标准

- [x] 审计三类快照的 payload JSON 和现有 `priority` 列覆盖率。
- [x] 只接受 payload 明确给出的 `P0`、`P1`、`P2`。
- [x] 在单个 PostgreSQL 事务中回填全部可验证候选并回查分布。
- [x] 缺少 priority 证据的快照继续保留 `NULL`。
- [x] 全量和增量 MQL 显式选择 `priority` 并投影 `key_label_value.label`。
- [x] batch detail 缺少 Priority 时保留同一 MQL 候选值，清洗阶段不清空该投影。
- [x] 核对 Tech Team 的真实字段配置与 MQL shape，不在本任务中擅自增加跨类型数据库投影。
- [x] Tech Task 和 Production Bug 的单条、全量、增量 batch-get 显式请求各自 Team field key；Story 不请求不存在的字段。

## 背景与范围

目标空间为 `4c3fv6`（Tenways Software R&D），目标类型为 `story`、`66700acbf297a8f821b4b860`（Tech Task）和 `6932e40429d1cd8aac635c82`（Production Bug）。数据库共有 1,203 条目标快照，清洗前独立 `priority` 列全部为空；仅 10 条 payload 包含 priority 字段，其余 1,193 条没有可恢复证据。

v1 只修改本地 PostgreSQL 快照的 `priority` 列，不修改 `payload_json`。v2 修改 Server MQL 同步协议，使后续全量和增量同步都能写入 Priority。v3 保留 batch-get，并增加类型专属 Team 字段请求，使后续同步 payload 捕获原始 Team；不新增数据库 `team` 列、不执行额外全量同步，也不修改 Meegle 平台工作项。

## 方案与决策

Story 和 Tech Task 从 `fields.fields[]` 中匹配 `field_key = priority`，读取 `field_value.label`；Production Bug 从 `fields.work_item_fields[]` 中匹配 `key = priority`，读取 `value.label`。仅当值精确匹配 `P0`、`P1`、`P2` 时才允许写入。

执行时锁定 1,203 条目标快照，并以候选数必须等于只读审计结果 10 作为事务保护；候选数量变化则整体回滚。

v2 在 MQL `SELECT` 中使用稳定系统字段 key `priority`，从返回的 `key_label_value.label` 读取显示值。batch detail 仍负责补充关系和生命周期字段；当其没有 Priority 时，合并逻辑保留同一条 MQL 候选的值，再由普通 upsert 写入 `meegle_workitem_syncs.priority`。clean-after-sync 不重算或更新该列，因此不会清空已写入值。

Tech Team 不是通用 `team` 系统字段：Tech Task 使用 `field_7c2f56`，Production Bug 使用 `field_26ef68`，Story 没有该字段；两者均为 select，MQL 返回 `key_label_value.label`。当前快照 schema 和列表 API 没有 Team 投影，新增它需要独立确认数据模型范围。

v3 将上述动态 field key 集中保存在 Meegle cleaning/detail fallback config。`getMeegleCleaningFieldKeys()` 对 Tech Task 的 type key/API alias 返回 `field_7c2f56`，对 Production Bug 的 type key/API alias 返回 `field_26ef68`；同步服务的单条、全量和增量详情请求均复用该函数。字段只进入原始 payload，当前 cleaner 不投影 Team。

只读 MQL 实测确认 Sprint、Version、System、Bugs、`start_time` 和 `finish_time` 均可显式 SELECT；当前 adapter 只是没有选择和解析这些关系字段。MQL 的起止时间返回日粒度 `string_value`，关系字段还会返回 `cascade_key_label_value` 等类型专属结构；现有生命周期计算同时依赖 workflow node 详情，因此此次不以 MQL 替换 batch-get。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-31 | v1 | in_progress | 只读审计确认 1,203 条 payload 均为合法 JSON；10 条含可验证 Priority，独立列均为空。 | 执行事务回填。 |
| 2026-08-31 | v1 | completed | PostgreSQL 事务更新并提交 10 条：Tech Task 6、Production Bug 2、Story 2；提交前聚合回查与候选一致。 | 其余 1,193 条 payload 没有 priority，不能从数据库恢复。 |
| 2026-08-31 | v2 | completed | MQL 已选择并解析 Priority；detail 合并会保留 MQL 值，增量 clean-after-sync 用例证明清洗链路不丢失投影。真实 MQL 抽样确认三类 Priority 均返回 `key_label_value.label`。 | 未执行全量线上同步；Team 投影保持独立后续范围。 |
| 2026-08-31 | v3 | completed | batch-get 已按类型显式请求 Tech Task `field_7c2f56` 与 Production Bug `field_26ef68`；Story 请求列表不变。 | 新 payload 会捕获 Team，但未新增数据库/API Team 投影，也未执行线上同步。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| PostgreSQL 只读审计 | 通过 | 1,203 条目标 payload，0 条非法 JSON；10 条包含标准 Priority 字段。 | 未读取或修改 Meegle 平台。 |
| PostgreSQL 事务回填 | 通过 | `candidate_rows=10`、`updated_rows=10`；Tech Task 为 P0×1/P1×4/P2×1，Production Bug 为 P1×2，Story 为 P0×2。 | 只更新 `meegle_workitem_syncs.priority`。 |
| 缺失证据保护 | 通过 | Tech Task 514、Production Bug 255、Story 424 条继续为 `NULL`。 | 未推断缺失优先级。 |
| Meegle 只读 MQL 抽样 | 通过 | Tech Task 返回 `1/P1`、Production Bug 返回 `option_1/P0`；代码统一持久化 label。 | 只读调用，未修改 Meegle。 |
| Team payload 数据质量 | 覆盖不足 | 1,203 条 payload 均为合法 JSON；Tech Task 仅 6/520 条含有效 `Dev Team 2`，其余 514 条缺失；Production Bug 0/257 条包含 Team；Story 无 Team 字段。 | 现有 payload 最多恢复 6 条，且当前快照 schema 没有 `team` 列；未执行写入。 |
| Server 定向测试 | 通过 | 2 个文件、33 个用例通过。 | 覆盖 MQL 字段、两种枚举返回 shape、detail fallback 和增量 clean-after-sync。 |
| Server build | 通过 | `pnpm --dir server build`。 | TypeScript 编译通过。 |
| Server 全量测试 | 有既有环境失败 | 124 个文件、600 个用例通过；6 个 SQLite suites 缺少 `node:sqlite`，logger dated-file 时序用例失败。 | 本次 Meegle Shell Client 与 Platform Sync Service 用例全部通过；失败与本次改动无关。 |
| Team batch-get 定向测试 | 通过 | 2 个文件、29 个用例通过；Server build 通过。 | 覆盖 Tech Task/Production Bug type key 与 Production Bug API alias；未执行真实写入同步。 |
| 关系/生命周期 MQL 能力抽样 | 通过 | 三类 work item 均可 SELECT 类型专属 Sprint/Version/System/Bugs 及 `start_time`/`finish_time`；Production Bug System 实际返回 `cascade_key_label_value`。 | 只读限 1 条抽样；MQL 日期为日粒度，未验证其能替代 workflow node 详情。 |

## 关联

- `server/src/adapters/meegle/meegle-shell-client.ts`
- `server/src/adapters/meegle/meegle-client.ts`
- `server/src/adapters/postgres/platform-sync-store.ts`
- `server/src/application/services/platform-sync.service.ts`
