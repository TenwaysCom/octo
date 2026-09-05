---
title: "Ticket 问题总结与 Shadow Worker 共用 ZCode Provider"
module: "ai-ticket"
status: done
requirement_version: 1
created_on: 2026-09-05
updated_on: 2026-09-05
closed_on: 2026-09-05
owner: TBD
related:
  - "https://docs.bigmodel.cn/cn/api/introduction"
  - "lark-ticket-support-qa-summarize"
  - "lark-ticket-shadow-summary"
---

# Ticket 问题总结与 Shadow Worker 共用 ZCode Provider

## 目标

为 Lark Ticket「问题总结」Quick Action 和 Shadow Worker 增加 ZCode（智谱 API）结构化输出接入；两者必须统一读取同一组 provider/model 配置。保留 DeepSeek 为默认兼容 provider，不改变 Answer、Document 或 ACP 会话行为。

## 验收标准

- [x] `LARK_TICKET_SUMMARY_PROVIDER=zcode` 时，Quick Action 与 Shadow Worker 都使用 ZCode Chat Completions。
- [x] 两个入口共用 `LARK_TICKET_SUMMARY_MODEL`，仍执行固定快照、JSON schema 和 evidence ID 校验。
- [x] ZCode 缺 key、超时、HTTP 失败和无效响应均返回或写入区分明确的错误码。
- [x] 默认 DeepSeek 配置及既有 Shadow timeout 兼容字段继续有效。

## 背景与范围

ZCode 通过智谱标准 OpenAI Chat Completions 兼容端点调用。两条 Ticket Summary 路径此前分别直接构造 DeepSeek client，导致 provider/model 配置无法保证一致。本次只改无工具的一次性总结路径，不将 ZCode 接入 ACP、普通 AI Session 或浏览器端。

## 方案与决策

- 在 Server adapter 层集中 provider factory，支持 `deepseek` 与 `zcode`；环境变量 `LARK_TICKET_SUMMARY_PROVIDER`、`LARK_TICKET_SUMMARY_MODEL` 和 `LARK_TICKET_SUMMARY_TIMEOUT_MS` 是两条路径唯一的共同模型配置。
- ZCode 通过官方标准 OpenAI Chat Completions base URL 调用，使用 `ZCODE_API_KEY`，不向客户端传递 key。
- `tasks.shadow.summaryTimeoutSeconds` 是 Shadow Worker 的超时覆盖；历史 `deepSeekTimeoutSeconds`、`acpTimeoutSeconds` 继续只读兼容。
- Quick Action catalog 用 `ticket_summary` 表示 Server 配置的直连结构化模型，避免将实际 vendor 错误暴露为静态页面配置。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-09-05 | v1 | in_progress | 已完成 provider factory、ZCode adapter、Quick Action/Shadow 共用接线、配置示例与契约文档更新。 | 运行定向测试与 Server 构建。 |
| 2026-09-05 | v1 | done | 定向回归通过；Server build、全量测试，Extension typecheck、全量测试与生产构建通过。 | 未持有或调用真实 ZCode key；上线后由部署配置和一张脱敏 Ticket 验证。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 定向回归 | 通过 | 8 files / 50 tests，覆盖 DeepSeek/ZCode adapter、共享 provider factory、Quick Action、Shadow Worker、配置兼容与 controller 映射。 | mock provider/thread/store。 |
| Server 全量测试与构建 | 通过 | `pnpm --dir server build`；`pnpm --dir server test`（148 files / 715 tests）。 | 不调用真实 ZCode 或 Lark。 |
| Extension 契约验证 | 通过 | `pnpm --dir extension typecheck`；`pnpm --dir extension test`（45 files / 282 tests）；`pnpm --dir extension build`。 | 不做浏览器实机或 provider 调用。 |

## 关联

- `docs/ai-dev/lifecycle/current-system-technical-objects.md`
- `docs/ai-dev/rules/server-code-rules.md`
- `docs/tenways-octo/it-platform-sync.md`
