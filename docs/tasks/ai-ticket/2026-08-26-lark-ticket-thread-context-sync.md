---
title: "Lark Ticket Thread 上下文按需同步"
module: "ai-ticket"
status: completed
requirement_version: 5
created_on: 2026-08-26
updated_on: 2026-08-31
closed_on: 2026-08-31
owner: TBD
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# Lark Ticket Thread 上下文按需同步

## 目标

为 Lark Ticket 的 Kimi ACP 分析提供可复用的 thread 消息快照。Ticket 批量同步只维护消息链接；AI 首次需要上下文时按需读取 Lark，后续根据缓存新鲜度和增量水位决定是否再次访问 Lark。终态 Ticket 在成功取得满足分析范围的快照后冻结。

本次不在 FE 默认展示 thread 消息，不下载或持久化图片二进制。

## 验收标准

- [x] Ticket full/incremental 同步不为每条 Ticket 拉取 thread messages。
- [x] Thread 快照以版本化 JSON 保存，并记录成功同步、水位、完整性和冻结状态。
- [x] `ensureThreadContext` 可区分数据库命中、首次全量、增量检查和完整对账。
- [x] `Finish`、`Cancelled`、`Rejected` 在成功同步且覆盖范围满足后只使用数据库快照。
- [x] 新建 Kimi Ticket Session 使用 ensure 后的上下文，续聊不重复访问 Lark。
- [x] Lark 分页或持久化失败不会覆盖已有完整快照或错误推进水位。
- [x] Server 相关单测和 build 通过。
- [x] 提供只限定单个 Base/Table 的 Finish Ticket thread 历史补齐脚本，默认 dry-run，`--apply` 才访问 Lark 并写入 Octo。
- [x] 支持 `--limit` 限制本次实际尝试的候选数量，便于小批试跑。
- [x] 从 thread 回复的 `root_id` 读取根消息，不再将 `thread_id` 作为 `message_id` 请求；旧快照缺 root 时会重新纳入补齐候选。

## 背景与范围

现有 Ticket AI Session 只把 Ticket 字段及 Lark message link 写入首轮 prompt；Lark adapter 的 thread 读取只取第一页。Thread 消息与 Bitable Ticket 有独立变更节奏，不能复用 Ticket scope checkpoint，也不能在批量 Ticket 同步中逐条读取。

## 方案与决策

- 新增 `lark_ticket_thread_syncs`，以 Ticket 复合键保存当前 thread 的版本化消息 JSON 与独立同步元数据。
- Ticket 同步只更新已有 `lark_message_link` 投影；消息拉取由 AI 上下文服务按需执行。
- 新建 AI Session 在构建首轮 prompt 前执行 ensure；续聊依赖 Kimi Session 已有上下文，不再次 ensure。
- 活跃 Ticket 采用可配置 TTL、创建时间水位增量读取和低频完整对账；终态 Ticket 仅在无成功/足量快照时同步一次，随后冻结。
- 图片仅保留消息类型或资源 key，不下载二进制和临时 URL。
- 历史补齐使用 `platform:backfill-finished-lark-ticket-threads`：仅选择 `ticket_status=Finish`、存在可解析 thread link、且没有同一 thread 的完整快照的记录；必须显式传入 `baseId + tableId`，避免跨表批量调用。可选 `--limit` 只截断本次候选集，预检仍显示完整候选数量。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-26 | in_progress | 已确认现有 Ticket sync、Lark adapter、Kimi Session ownership 与内部路由边界。 | 实现 schema/store、ensure、ACP 接入与测试。 |
| 2026-08-26 | completed | 新增 thread sync store、分页/增量 ensure、终态冻结、Kimi 首轮快照、签名内部接口；定向 37 tests 与 Server build 通过。 | 未对真实 Lark tenant 做在线调用；全量套件仍受本机 `node:sqlite` 缺失与既有 logger 文件测试影响。 |
| 2026-08-27 | completed | 内部 ACP Ticket 上下文 controller 改为按首次已授权请求懒创建数据库服务，避免路由注册先于 `ensureSharedDatabase()` 访问 SSH PostgreSQL；controller/index 定向 5/5、Server build 与实际 `server start` 启动通过。 | 未发起真实签名 Ticket 上下文请求。 |
| 2026-08-31 | completed | v2：新增 Finish Ticket 历史 thread 补齐脚本和单测；默认预检不访问 Lark，`--apply` 要求显式授权身份和 HTTPS 域名，并复用既有 `ensure()` 保存/冻结逻辑。 | 未执行真实 Lark 批量调用；需先对目标 Base/Table dry-run 确认数量。 |
| 2026-08-31 | completed | v3：新增 `--limit`，仅限制本轮实际尝试的候选数，保留完整预检统计以便分批执行。 | 未执行真实 Lark 批量调用；需先对目标 Base/Table dry-run 确认数量。 |
| 2026-08-31 | completed | v5：根消息改由 thread 回复中的 `root_id` 拉取；补齐脚本检测到旧快照有回复却缺 root 时，会强制全量重拉。 | 未执行真实 Lark 批量调用；需先部署到远端后对 3 条已补齐记录做受控验证。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 定向单测 | 通过 | `pnpm --dir server exec vitest run ...`：10 files / 37 tests | 覆盖 adapter、store、ownership、ensure、Kimi Session、内部 controller、auth 和 route catalog。 |
| v2/v3 批量补齐脚本单测 | 通过 | `pnpm --dir server exec vitest run src/scripts/backfill-finished-lark-ticket-threads.test.ts src/application/services/lark-ticket-thread-context.service.test.ts`：2 files / 11 tests | 覆盖参数保护、候选筛选、`--limit`、限并发与复用的 thread ensure 决策；未调用 Lark。 |
| v5 根消息补齐定向测试 | 通过 | `pnpm --dir server exec vitest run src/scripts/backfill-finished-lark-ticket-threads.test.ts src/application/services/lark-ticket-thread-context.service.test.ts`：2 files / 13 tests | 覆盖 root ID 与 thread ID 分离、旧快照缺 root 重试和 pnpm 参数分隔符；未调用 Lark。 |
| Server build | 通过 | `pnpm --dir server build` | TypeScript 编译通过。 |
| PostgreSQL schema migration | 通过 | `pnpm --dir server db:migrate`：`[db] ensured postgres schema` | 已对当前配置的数据库执行幂等建表/加列。 |
| Server 全量单测 | 非本功能失败 | 116 files / 533 tests 通过；`node:sqlite` 6 suites 无法加载，既有 logger 文件落盘测试失败 | Node v22.12.0 运行时未提供 `node:sqlite`；logger 失败可独立复现。 |
| 真实 Lark API | 未执行 | 无生产凭据调用 | 上线后需观察分页、rate limit 与 token scope。 |

## 关联

- [平台同步设计](../../tenways-octo/it-platform-sync.md)
