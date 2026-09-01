---
title: "Internal IT Support Copilot"
module: "ai-ticket"
status: in_progress
requirement_version: 1
created_on: 2026-09-01
updated_on: 2026-09-01
closed_on: null
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
- [x] Server 与 FE 构建通过。

## 方案与决策

- Quick Actions 保持既有 profile、skill 与 ACP policy；发送是独立、显式确认的 Web API，不由模型自动执行。
- 发送前使用当前 Session 的 Ticket 归属、Answer action key 和 thread root message 复核；相同 Ticket/Session/草案 hash 不重复发送。
- 新增派生分析/审核/草案审计表及支持知识文档/chunk 索引，但本次不运行 schema migration、导入历史案例或真实 Lark API。
- Answer 仍须完成既有 Support-QA `fetch --json` 证据门禁；本地检索只补充已批准引用，不能取代 Ticket 证据。
- Prepared thread 与原始消息同表保存；现有历史行在重新同步或显式离线回填前允许为空，读取时确定性回退生成，不自动触发外部同步。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-01 | v1 | in_progress | 已实现服务端确认发送门禁、分析准备函数、prompt 合同、FE 确认按钮及 approved-only 知识检索；定向测试、Server build、FE test/build 通过。 | 未调用真实 Lark；派生分析批处理、审核 UI 与知识索引的审批/导入入口仍待实现。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 定向单测 | 通过 | 知识 Store、Ticket AI Session、脱敏共 3 files / 10 tests | 覆盖 approved-only 检索、撤销排除、chunk 脱敏、Answer prompt 引用和既有 fetch 门禁；未 mock 真实发送 service。 |
| Prepared thread 持久化 | 通过 | Thread Store/Context、Ticket AI Session、脱敏共 4 files / 16 tests | 覆盖原文保留、Prepared JSON 脱敏、版本读回及 AI Session 消费；未执行真实数据库迁移或历史回填。 |
| Prepared thread 本地回填 | 通过 | Script、Thread Store、脱敏共 3 files / 6 tests | 覆盖参数范围、dry-run/apply 边界、版本并发保护、脱敏与本地写入；未连接真实 PostgreSQL。 |
| Server build | 通过 | `pnpm --dir server build` | TypeScript 编译通过。 |
| FE 单测与 build | 通过 | 127 tests、Vite production build | 未进行登录态或真实 Lark UI 验收。 |

## 关联

- [平台同步设计](../../tenways-octo/it-platform-sync.md)
