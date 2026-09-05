---
title: "DeepSeek 直连 Ticket 问题总结与 Shadow Worker"
module: "ai-ticket"
status: done
requirement_version: 2
created_on: 2026-09-04
updated_on: 2026-09-04
closed_on: 2026-09-04
owner: Codex
related:
  - "lark-ticket-support-qa-summarize"
  - "lark-ticket-shadow-summary"
---

# DeepSeek 直连 Ticket 问题总结与 Shadow Worker

## 目标

将「问题总结」Quick Action 和 shadow summary worker 从 Kimi ACP 改为服务端直连 DeepSeek；两条路径继续共用数据库 Prompt、固定快照、结构化校验和证据门禁。Quick Action 写正式分析，shadow worker 只写独立 `shadow_ai`。Answer、Document 和普通会话仍走 ACP。

## 验收标准

- [x] Summary 使用 `deepseek-v4-flash` 默认模型和既有 PostgreSQL prompt key。
- [x] Shadow worker 同样直连 DeepSeek，不创建 ACP runtime，并保持候选、快照和 `shadow_ai` 写回语义。
- [x] 服务端校验 JSON schema、snapshot version 和 evidence message IDs 后才写入正式分析。
- [x] Summary 复用 SSE 展示，但不创建或持久化可续聊 Session。
- [x] Answer、Document 与普通 Kimi ACP 会话无行为变化。
- [x] 使用安全配置的 API key 完成合成脱敏 Ticket 的 DeepSeek 运行时读回。

## 背景与范围

现有 Summary 依赖 ACP 执行 Ticket fetch、临时文件和签名 analysis-update。新链路由 Server 自己取得脱敏固定快照，只把分析输入和 JSON schema 交给 DeepSeek，不传 workspace、Skill、shell、token 或内部签名能力。

## 方案与决策

- action catalog 以 `provider` 区分 `deepseek` 与 `kimi_acp`。
- Summary 与 shadow worker 共用既有 `lark_ticket.support_qa.summarize` key；运行时优先读取数据库值，内置默认内容作为缺失兜底。启动迁移仅替换仓库已知旧默认值，不覆盖管理员自定义内容。
- 共享 Prompt 内容变更后，shadow 结果的 `promptVersion` 从 `v2` 提升为 `v3`；shadow provider 改为 DeepSeek 后继续提升为 `v4`，写入位置仍为独立 `shadow_ai`。
- Quick Action 的 DeepSeek 输出通过现有 `SupportAnalysisPayload` Zod schema 和固定快照 evidence ID 白名单后，直接调用 `SupportTicketAnalysisService.update()`；shadow 输出通过对应校验后只写 `shadow_ai`。
- 当前抽屉只展示一次性结果并禁止追问；长期结果从 Ticket AI 投影读取。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-04 | v1 | completed | 直连 adapter、服务编排、SSE/FE 一次性行为、prompt seed 和单测已实现 | 未对真实 Lark Ticket 执行生产写回 |
| 2026-09-04 | v1 | completed | Prompt 改为共用原 key 和指定完整分类文本；迁移测试改为直接验证迁移函数 | `pg-mem` 不支持在同一内存库重复执行整套 schema DDL；不影响 PostgreSQL 运行时 |
| 2026-09-04 | v1 | completed | Server 全量首轮命中已记录的 logger 落盘时序波动；logger 定向复跑和随后全量复跑均通过 | 该波动与本次路径无关，见 `ERR-20260903-005` |
| 2026-09-04 | v2 | completed | Shadow worker 从 Kimi ACP one-shot 改为共用 DeepSeek adapter；保留数据库 Prompt、固定快照、schema/evidence 校验、候选重试和 `shadow_ai` 写回 | 未对真实 Lark Ticket 执行 shadow 运行时写回 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 目标 Server 单测 | 通过 | 7 files / 43 tests：DeepSeek adapter、action、workflow、controller/SSE、prompt seed/migration、shadow prompt version | mocked provider |
| Server 全量单测与构建 | 通过 | 146 files / 705 tests；`pnpm --dir server build` | Ticket 写回由 mock/存储层测试覆盖 |
| FE 全量单测与构建 | 通过 | 146 tests；`pnpm --dir fe build` | 未做浏览器目检 |
| Extension 全量单测、类型检查与构建 | 通过 | 45 files / 282 tests；typecheck；WXT build | 非浏览器运行时 |
| DeepSeek 真实 API 探针 | 通过 | 合成脱敏 Ticket 返回 `deepseek-v4-flash`、`support-analysis-result-v1`、`troubleshoot / integration_sync`，evidence ID 校验通过 | 未连接 Lark，未写 PostgreSQL |
| Shadow provider 目标单测 | 通过 | 3 files / 26 tests：shadow DeepSeek 编排、DeepSeek adapter、调度 timeout 配置与旧别名 | mocked DeepSeek/thread/store |
| v2 Server 全量单测与构建 | 通过 | 146 files / 707 tests；`pnpm --dir server build` | 未启动真实 shadow worker，未调用 Lark 或 DeepSeek |

## 关联

- `docs/ai-dev/lifecycle/current-system-technical-objects.md`
- `docs/ai-dev/rules/server-code-rules.md`
