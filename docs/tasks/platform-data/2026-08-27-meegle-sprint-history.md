---
title: "Meegle Sprint 历史与详情"
module: "platform-data"
status: in_progress
requirement_version: 6
created_on: 2026-08-27
updated_on: 2026-08-27
closed_on: null
owner: Codex
related:
  - "TEN-57"
---

# Meegle Sprint 历史与详情

## 目标

基于本地 Meegle 快照提供不会被后续 Sprint 切换改写的 Sprint 历史、详情和按日生命周期图表。当前工作项快照继续保存当前 Sprint；PostgreSQL 另外保存每段连续 Sprint 归属及其生命周期时间，并区分历史推定与增量观察，用于 Scope、Started、Completed 和 Carryover 分析。历史初始化和后续清洗不得为了补齐证据额外请求 Meegle。

## 当前行为与问题

- `meegle_workitem_syncs` 只有一组当前 `sprint_id`、add/start/finish；A 切换到 B 时 A 会被覆盖。
- 因此旧 Sprint 的工作项、Scope 和完成率会随之后的同步变化，B 也无法区分临时新增与从 A 延期进入。
- start/finish 在重开、回到 New 或切换 Sprint 后还会继续变化；只保存 Sprint 关系的 added/removed 仍不足以稳定旧 Sprint 图表。

## 当前有效需求（v6）

### 范围

- v4 的当前工作项 PG-only 历史清洗需求保持有效且不变；v5 在其结果之上新增 Sprint 归属历史。
- v6 保留 v4、v5 的全部有效要求，只为 Sprint 归属增加证据来源和准确性边界。
- 新增 PostgreSQL Sprint 归属历史，供 Sprint 列表、详情、图表和分类使用。
- 当前工作项快照仍保存当前 `sprint_id`、`sprint`、`add_to_cycle_time`、`item_start_time`、`item_finish_time`，供普通列表和兼容接口使用。
- Server 负责归属转换和分类；FE 只消费投影结果，不从当前 `sprint_id` 猜历史。

### 非范围

- 不保存 operation records 或完整状态事件流。
- 不持久化 `item_cycle_tag`、`carryover` 布尔值或手工分类标签。
- 不通过 full sync、额外 work item detail、workflow all-nodes 或其他 Meegle API 恢复旧 Sprint 关系。
- 不承诺恢复当前 PostgreSQL 快照已经覆盖掉的历史 Sprint 归属；缺失历史保持未知。

## 数据模型

新增逻辑对象 `MeegleWorkitemSprintMembership`，由 Server 投影并存入 PostgreSQL。每段连续 Sprint 归属一条记录；工作项离开后再次进入同一 Sprint 时生成新的归属区间。

| 字段 | 含义 |
| --- | --- |
| `project_key`、`work_item_type_key`、`work_item_id` | 工作项稳定身份 |
| `sprint_id` | Sprint 稳定身份；不以名称关联 |
| `added_at` | 首次观察到进入本段 Sprint 归属的时间 |
| `started_at` | 本段 Sprint 内首次进入非 New 状态的有效时间 |
| `finished_at` | 本段 Sprint 内进入 Finished 的有效时间；重开时可清空 |
| `removed_at` | 首次观察到离开本段 Sprint 归属的时间；当前归属为 `null` |
| `source` | `historical_inferred` 表示 PG-only 历史推定；`incremental_observed` 表示 v6 上线后由正常增量同步观察到的新归属区间 |

Sprint 名称、起止日期和描述继续来自 Sprint 快照，不复制为关系身份。实现可保存审计用创建/更新时间，但不能用同步更新时间代替业务时间。

## 行为契约

### 当前工作项历史清洗（沿用 v4，未变更）

- 数据来源仅限 `meegle_workitem_syncs.payload_json` 和 PostgreSQL 中已保存的 Sprint 快照。
- 不读取 operation records，不额外调用 Meegle work item、workflow node 或 all-nodes API；节点数据不存在时不补拉。
- `add_to_cycle_time` 使用工作项创建时间与 Sprint 开始时间的较晚值。
- `item_start_time` 使用快照内已存节点中最早的非 New 节点开始时间；只有当前活动节点时使用其开始时间；没有证据则写 `null`。
- `item_finish_time` 使用快照内完成字段或终态节点时间；没有证据则写 `null`。当前为 New 时 start/finish 均写 `null`。
- 清洗必须覆盖旧的错误投影值，不能因新值为 `null` 而保留旧值。

### 增量同步

- 只使用正常增量同步已经取得的 work item detail、当前 PostgreSQL 工作项快照和 Sprint 快照；不得增加外部请求。
- Sprint 字段未出现在本次 detail 中时，视为证据缺失并保留当前关系；Sprint 字段明确为空时，关闭当前归属并清空当前快照关系。
- 首次观察到 Sprint S 时，以本次观察时间创建 `source=incremental_observed` 的开放归属。
- 仍在同一 Sprint S 时，不改变 `added_at`；Started 保留本段最早 `started_at`，Finished 写 `finished_at`，重开清空 `finished_at` 并保留 `started_at`，回到 New 清空本段 start/finish。
- 从 A 切换到 B 时，先以本次观察时间关闭并冻结 A 的归属，再创建 B 的开放归属；B 的 `added_at` 为本次观察时间，不能复用 A 的加入时间。
- 进入 B 时如果已经 Started，B 的 `started_at = max(工作项 start, B.added_at)`；如果已经 Finished，B 的 start/finish 均不得早于 `B.added_at`。证据缺失时保持 `null`。
- A 的 start/finish 在关闭后不再被 B 的后续状态、重开或回到 New 改写。

### Sprint 归属历史初始化（v5 新增）

- 数据来源仅限 `meegle_workitem_syncs.payload_json`、当前投影字段和 PostgreSQL 中已保存的 Sprint 快照。
- 对每个当前存在 `sprint_id` 的工作项最多创建一条当前开放归属：`added_at` 优先使用已存 `add_to_cycle_time`，否则使用 `max(工作项创建时间, Sprint 开始时间)`；start/finish 使用 v4 的 PG-only 投影并限制为不早于 `added_at`。
- 历史初始化创建的归属统一标记为 `source=historical_inferred`。之后在同一 Sprint 再次同步不能把该区间升级为 observed；只有后续实际观察到的新 Sprint 区间才标记为 `incremental_observed`。
- 无法从当前快照证明的旧 Sprint 归属不创建、不猜测；节点或日期证据缺失时对应时间写 `null`。
- 初始化必须幂等。它不构造 Meegle client，不读取 operation records，也不请求 work item、workflow node 或 all-nodes API。

### Sprint 图表

对 Sprint S 的每个自然日结束时点 D，按归属区间计算：

- `Scope`：`added_at <= D` 且 `removed_at` 为空或 `removed_at > D`。
- `Started`：属于 Scope，且 `started_at <= D`，并且 `finished_at` 为空或 `finished_at > D`。
- `Completed`：属于 Scope，且 `finished_at <= D`。

图表只展示 Sprint 起止日期范围。Work Item 通常在旧 Sprint 结束后才切入新 Sprint，因此旧 Sprint 结束日仍会保留其未完成 Scope；若在 Sprint 结束前明确移除，Scope 从移除后的统计时点下降。

API 应返回关系来源；FE 对包含 `historical_inferred` 关系的历史统计显示为推定或不完整，不能与完全由增量观察得到的数据使用同一准确性表述。

### 派生分类

- `Carryover`：归属 B 存在一个按时间顺序更早的归属 A，并且 A 在其 Sprint 结束时没有 `finished_at <= A.end_at`。A 或 B 的日期证据不足时结果为 Unknown，不猜测。
- 非 Carryover 时，`Planned` 表示 `added_at <= Sprint.start_at + 24 小时`；`After cycle` 表示晚于该时间加入。
- 分类优先级为 `Carryover > Planned / After cycle`，只在 API/FE 投影时计算，不落库。
- 对 `historical_inferred` 关系不推导历史 Carryover；结果为 Unknown。Planned/After cycle 可以基于推定 `added_at` 计算，但必须同时标记为 estimated。

## 验收标准（v6）

- [x] v4 当前工作项 PG-only 历史清洗代码、定向测试、Server 全量测试和 build 已完成，且外部 client 调用为 0；该规则继续有效。
- [x] 已在目标 PostgreSQL 执行 v4 PG-only 当前工作项历史清洗并完成只读聚合核对；未调用 Meegle。
- [x] PostgreSQL schema 新增每段连续 Sprint 归属的历史表，支持同一工作项多次进入不同 Sprint，并保留已关闭关系。
- [x] 每条关系保存 `historical_inferred` 或 `incremental_observed` 来源；同一推定区间后续同步不能被错误升级为 observed。
- [x] A → B 切换后，A 的 added/started/finished 不再变化；B 使用独立的 added/started/finished。
- [x] 明确移除、同 Sprint 状态变化、完成、重开、回到 New 和同 Sprint 重入均符合行为契约。
- [ ] Sprint 列表、详情工作项和 Scope/Started/Completed 图表改为读取 Sprint 归属历史，而不是只按当前 `sprint_id` 聚合。
- [ ] Carryover、Planned、After cycle 按上述规则派生，`item_cycle_tag` 和 carryover 标志不落库。
- [ ] API/FE 区分推定与观察数据：推定历史的 Carryover 为 Unknown，基于推定时间计算的 Planned/After cycle 标记为 estimated。
- [ ] PG-only 初始化幂等，只生成当前可证明的开放归属；旧关系证据不足时保持未知。
- [ ] 单元测试覆盖历史推定来源、推定区间不升级、首次观察加入、同 Sprint、A → B 未完成、A → B 已完成、提前移除、重开、New、同 Sprint 重入和缺失 Sprint 日期。
- [ ] 测试断言历史初始化和增量生命周期投影不会构造 Meegle client 或调用 operation/all-nodes API。
- [ ] Server 全量测试与 build、FE check 通过；登录态浏览器确认旧 Sprint 与新 Sprint 图表及 Carryover 展示。
- [ ] 在目标 PostgreSQL 执行 schema migration 和 PG-only 初始化，并用只读查询核对关系数量、开放关系唯一性及空值分布。

## 受影响层与技术对象

- Server application：Sprint 归属状态转换和派生分类。
- PostgreSQL store/schema：`MeegleWorkitemSprintMembership` 及历史/当前投影查询。
- Platform-data API：返回 Sprint 关系生命周期和派生分类。
- FE：Sprint 列表、详情、图表和标签筛选改用关系投影。
- 没有新的 Meegle adapter 能力，也不增加平台请求。

## 背景与范围

v4 已完成 Sprint 页面、稳定 `sprint_id`、当前生命周期投影和 PG-only 清洗代码，但它仍是单行当前状态模型。v5 将 Sprint 关系历史提升为独立 Server/PostgreSQL 技术对象；浏览器仍不实时读取 Meegle。

## 方案与决策

保留 `meegle_workitem_syncs` 作为当前工作项快照；新增一对多 Sprint 归属历史作为分析事实。Server 在每次正常增量 UPSERT 内比较旧、新 Sprint 关系并原子写入当前快照与归属区间。Sprint 页面从归属事实聚合，分类保持派生。该方案不升级为完整事件溯源，也不改变 Sprint 自身的独立同步策略。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-27 | v1 | done | 在现有 Octo FE SPA 增加 Sprint 历史、详情深链、右侧面板和标签筛选；完成当时的 FE/Server 测试与构建。 | 登录态浏览器视觉验收仍未执行。 |
| 2026-08-27 | v2 | superseded | 曾以 operation records 实现生命周期投影和按日图表。 | 后续决定不使用 operation records；该实现和测试不再作为当前完成证据。 |
| 2026-08-27 | v3 | superseded | 改为当前字段 + workflow all nodes，增加 `sprint_id` 并移除持久化 `item_cycle_tag`；当时 Server 573 项、FE 73 项测试及两端构建通过。 | 后续明确历史清洗不得请求节点 API；该生命周期数据源方案已废弃。 |
| 2026-08-27 | v3 | superseded | 已执行数据库迁移和 Sprint-only full sync；之后误执行通用 Meegle full sync，读取全部配置 work item 类型并写入 PostgreSQL 快照。 | 未写 Meegle；未经确认不删除新增快照。后续本地数据处理已纳入 v5 PG-only 初始化边界。 |
| 2026-08-27 | v4 | in_progress | 需求重新对齐为 PG-only 历史清洗；代码开始移除额外节点请求，并让清洗写回完整 lifecycle。定向测试 51 项中 50 项通过。 | 该中间状态已由下一条 v4 记录完成。 |
| 2026-08-27 | v4 | done | 当前工作项历史覆盖与增量合并实现已完成；定向测试 54/54、Server 全量测试 576/576、Server build 通过。随后在确认范围后对项目 `4c3fv6` 执行 PG-only 清洗：1215 条候选、1215 条更新，未调用 Meegle。 | 只读核对：458 条当前 Sprint 关联均有 add，180 条有 start、959 条有 finish，start 晚于 finish 为 0；23 条 add 晚于全局 start 属于先开始后进入当前 Sprint，需由 v5/v6 关系历史表达。 |
| 2026-08-27 | v5 | in_progress | 已新增连续 Sprint 归属 schema 和增量状态转换；正常增量 UPSERT 在同一事务中冻结 A、创建 B，并处理明确移除、同 Sprint 完成/重开/New 及重入。 | PG-only 批量初始化、API/FE 改用归属历史、派生分类和目标数据库迁移尚未实施。 |
| 2026-08-27 | v6 | in_progress | 关系保存 `historical_inferred` / `incremental_observed`；已有当前快照首次进入新逻辑时惰性创建推定开放区间，同 Sprint 后续同步不升级来源。 | 历史批量初始化、准确性 API/FE 提示和目标数据库验证尚未实施。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测 / 构建 | 通过（v3 基线） | `pnpm --dir fe check`：73/73 tests passed；Vite build passed。 | 未覆盖 v5 关系历史数据源和 Carryover 展示。 |
| Server 生命周期定向测试 | 通过（v4，有效前置） | 5 个文件共 54 项全部通过；覆盖当前快照的最早 start、完成、重开、New 清空及外部 client 调用为 0。 | 当前清洗需求已验证；尚未覆盖 v5 新增的多 Sprint 归属区间。 |
| Server 全量测试 | 通过（v4，有效前置） | `pnpm --dir server test`：128 个文件、576 项全部通过。 | 测试使用本地 mock / 测试存储；只能证明 v4 清洗，不能证明 v5 新增功能。 |
| Server build | 通过（v6 本地实现） | `pnpm --dir server build`。 | schema 尚未应用到目标 PostgreSQL。 |
| 增量 Sprint 归属状态转换 | 通过（本地定向） | domain、生命周期、增量编排、PostgreSQL schema/store 共 50 项测试通过；覆盖首次观察、惰性推定、同 Sprint、A → B、完成、重开、New、明确移除和同 Sprint 重入。 | API/FE 尚未读取关系表；PG-only 批量初始化未实现。 |
| Server 全量测试 | 通过（v6 本地实现） | `pnpm --dir server test`：129 个文件、583 项全部通过。 | 未执行真实增量同步或目标数据库迁移。 |
| 数据迁移 / Sprint 同步 | 已执行 | 旧 schema migration 与 Sprint-only full sync 已完成。 | 后续误执行的通用 full sync 只更新了 PostgreSQL 快照；不作为 v5 验证证据。 |
| 目标 PG 的 v4 当前字段清洗 | 通过 | `platform:clean-meegle --apply`：1215 条候选、1215 条更新；只读聚合核对通过。595 条 finish 无 add 与 595 条无当前 Sprint 完全一致，有 Sprint 而缺 add 为 0；943 条 finish 无 start 均有 `finish_time` 字段，但没有已存节点或 node begin time。 | 缺少 start 证据时按 PG-only 规则保留 `null`；不以 finish/创建时间伪造 start，也不能恢复已覆盖的旧 Sprint 关系。 |
| v5/v6 关系 schema / PG-only 初始化 | 未执行 | - | 实现和本地测试通过后，执行前按外部资源授权门再次确认目标 PostgreSQL、影响行数和写入范围。 |

## 开放问题

无阻塞性产品问题。实现时表名、主键形式和查询索引可按现有 PostgreSQL store 约定确定，但必须保持“一段连续归属一条记录”和“同一工作项最多一条开放归属”的业务约束。

## 风险与后续

- 增量同步只能记录观察时间，无法声称是 Meegle 中实际发生切换的精确时间；API/UI 应按观察时间解释。
- 当前 PostgreSQL 快照已覆盖的旧 Sprint 关系无法在 PG-only 边界内恢复，不能为了提高覆盖率静默扩大到 API 或 operation records。
- 当前快照与关系历史必须在同一数据库事务中更新；并发或重试不能产生两个开放归属。
- Sprint 起止日期缺失时 Carryover 必须为 Unknown，不能按状态或名称猜测。
- 实现完成后更新 `docs/ai-dev/lifecycle/current-system-technical-objects.md`，将当前单行生命周期对象改为当前投影加关系历史。

## 关联

- `fe/src/pages/MeegleSprintPages.jsx`
- `fe/src/lib/meegle-sprint-history.js`
- `server/src/application/services/meegle-workitem-lifecycle.ts`
- `server/src/adapters/postgres/platform-sync-store.ts`
- `server/src/adapters/postgres/schema.ts`
