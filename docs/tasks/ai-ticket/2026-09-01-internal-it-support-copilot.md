---
title: "Internal IT Support Copilot"
module: "ai-ticket"
status: done
requirement_version: 1
created_on: 2026-09-01
updated_on: 2026-09-04
closed_on: 2026-09-04
owner: TBD
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# Internal IT Support Copilot

## 目标

在既有 Lark Ticket Support-QA Quick Actions 中加入可复用的 thread 脱敏准备、结构化意图/证据 prompt 合同，以及仅限人工确认的 Answer 草案发送门禁；不修改 thread 同步快照，也不执行真实历史回填。

## 验收标准

- [x] Thread 准备保留 message/reply 证据并脱敏邮箱、订单/工单引用。
- [x] 每次成功同步在原 `lark_ticket_thread_syncs` 行保存带快照/脱敏版本的 `prepared_messages_json`，原始 `messages_json` 保持不变。
- [x] 提供按 `baseId + tableId` 限定的 Prepared Message 本地历史回填脚本，默认严格只读 dry-run，`--apply` 只写 PostgreSQL，不读取 Lark 凭据或调用 Lark API。
- [x] Summary/Answer/Document Preview prompts 明确意图、证据、风险与草稿边界。
- [x] 仅 Answer Session、归属用户和同一 Ticket 可确认发送回复草案。
- [x] Answer 动作只检索人工批准、已脱敏的知识文档或历史案例，并传递可引用的 source_ref。
- [x] 提供经 Web Session 认证的 Ticket 分析更新接口，按固定快照原子更新 intent、result、quality，并校验证据 Message ID。
- [x] Summary Quick Action 在既有 `fetch --json` 门禁成功后，由 ACP 使用 SSH 签名 internal API 保存 intent、result、quality；未完成回写、无效结构或无效证据均不接受结果。
- [x] Server 与 FE 构建通过。

## 方案与决策

- Quick Actions 保持既有 profile/skill；Summary policy 提升为受限 `write+shell`，只允许写当前 actionRunId 对应的临时 analysis JSON 并执行精确的签名回写命令。发送仍是独立、显式确认的 Web API。
- 发送前使用当前 Session 的 Ticket 归属、Answer action key 和 thread root message 复核；相同 Ticket/Session/草案 hash 不重复发送。
- 新增派生分析/审核/草案审计表及支持知识文档/chunk 索引，但本次不运行 schema migration、导入历史案例或真实 Lark API。
- Answer 仍须完成既有 Support-QA `fetch --json` 证据门禁；本地检索只补充已批准引用，不能取代 Ticket 证据。
- Prepared thread 与原始消息同表保存；现有历史行在重新同步或显式离线回填前允许为空，读取时确定性回退生成，不自动触发外部同步。
- `PUT /api/web/lark-tickets/:recordId/support-analysis` 保留给 FE 人工修正/批准，固定 reviewer 为 human；ACP Quick Action 使用 `POST /api/internal/lark-ticket-ai` 的 `support-analysis-v1` 签名 payload，固定 reviewer 为 ai。两个入口共用分析应用服务。
- Summary 不在回复正文暴露结构化 JSON；ACP 写入指定临时文件并调用 `analysis-update`。Internal API 再执行 Zod、snapshot version 和 Message ID 校验。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-01 | v1 | in_progress | 已实现服务端确认发送门禁、分析准备函数、prompt 合同、FE 确认按钮及 approved-only 知识检索；定向测试、Server build、FE test/build 通过。 | 未调用真实 Lark；派生分析批处理、审核 UI 与知识索引的审批/导入入口仍待实现。 |
| 2026-09-01 | v1 | in_progress | 新增 Ticket 分析 PUT 接口与共享分析服务；扩展签名 internal API 和 Support-QA wrapper，Summary ACP 必须完成 fetch 与 analysis-update 后才接受结果。相关 10 files / 31 tests、Server build 和 wrapper dry-run 通过。 | 未执行真实 PostgreSQL migration、真实签名 HTTP 请求或 FE 展示验收；Answer/Document 不覆盖 Summary 分析。 |
| 2026-09-04 | v1 | done | 台账复核确认全部当前验收项已勾选；当前 Server 全量 146 files / 707 tests、FE 33 files 测试与 production build 通过。 | 真实 Lark、迁移、审核 UI、知识导入和分析批处理不属于本任务已验收范围；如需上线验证或扩展能力，另建任务。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 定向单测 | 通过 | 知识 Store、Ticket AI Session、脱敏共 3 files / 10 tests | 覆盖 approved-only 检索、撤销排除、chunk 脱敏、Answer prompt 引用和既有 fetch 门禁；未 mock 真实发送 service。 |
| Prepared thread 持久化 | 通过 | Thread Store/Context、Ticket AI Session、脱敏共 4 files / 16 tests | 覆盖原文保留、Prepared JSON 脱敏、版本读回及 AI Session 消费；未执行真实数据库迁移或历史回填。 |
| Prepared thread 本地回填 | 通过 | Script、Thread Store、脱敏共 3 files / 6 tests | 覆盖参数范围、dry-run/apply 边界、版本并发保护、脱敏与本地写入；未连接真实 PostgreSQL。 |
| Ticket 分析更新接口与 Quick Action | 通过 | Domain、Store、Service、Web/Internal Controller、ACP policy、Session、Route 共 10 files / 31 tests | 覆盖结构校验、脱敏、快照/证据门禁、原子 upsert、签名 internal 分流、精确临时路径权限和 fetch/update 双门禁；未连接真实 ACP/Lark/PostgreSQL。 |
| Support-QA wrapper | 通过 | `bash -n`、`node --check`、`analysis-update --dry-run --json` | 本地验证 payload 与命令分支；未读取密钥或发送真实 HTTP 请求。 |
| Server 全量单测 | 通过 | 140 files / 654 tests | 本轮全部通过，包括 logger transport。 |
| Server build | 通过 | `pnpm --dir server build` | TypeScript 编译通过。 |
| FE 单测与 build | 通过 | 127 tests、Vite production build | 未进行登录态或真实 Lark UI 验收。 |
| 台账复核回归 | 通过 | 2026-09-04：`pnpm --dir server test`（146 files / 707 tests）、`pnpm --dir fe test`（33 files）与 `pnpm --dir fe build`。 | 仍不替代真实 Lark/ACP 运行时验证；该验证不在本任务验收范围。 |

## 关联

- [平台同步设计](../../tenways-octo/it-platform-sync.md)
