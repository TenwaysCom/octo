---
title: "评估 OpenACP / Codex 替换 Kimi ACP"
module: acp
status: done
created_on: 2026-08-24
updated_on: 2026-08-24
closed_on: 2026-08-24
owner: TBD
related:
  - "./2026-08-24-lark-ticket-ai-session-permissions.md"
  - "../../tenways-octo/17-acp-design.md"
  - "../../tenways-octo/21-system-architecture-detailed.md"
  - "https://github.com/agentclientprotocol/codex-acp/blob/main/README.md"
  - "https://github.com/Open-ACP/OpenACP"
---

# 评估 OpenACP / Codex 替换 Kimi ACP

## Goal

评估在 Octo 中用 Codex 替换 Kimi Code ACP 的可行路径、修改范围、风险和工期，为后续方案决策提供依据。

本任务只记录 2026-08-24 完成的静态代码与文档调研，不安装 `codex-acp` 或 OpenACP，不修改运行时代码，也不代表已经完成真实环境联调。

## Acceptance

- [x] 区分 OpenACP 与 `codex-acp` 的定位，避免方案名称歧义。
- [x] 找到当前 Kimi ACP 在运行时、权限、会话、持久化和前端中的主要耦合点。
- [x] 给出不同迁移深度下的修改量和工期估算。
- [x] 明确推荐路径、关键风险和实测前置项。
- [x] 标注尚未完成的运行时验证边界。

## Background and scope

当前链路大致为：

```text
Lark Ticket FE -> Octo Server -> ACP Client -> Kimi Code ACP
```

Octo 已经使用 `@agentclientprotocol/sdk` 和 `ClientSideConnection`，运行时事件的大部分表达是 ACP 通用模型；但进程启动、权限请求解析、会话历史降级、命名和持久化仍包含明显的 Kimi 绑定。

此次调研覆盖：

- Server 的 ACP runtime、proxy、permission policy、session registry/history/ownership。
- Kimi 进程启动和历史导出适配。
- Lark Ticket 前端中的 provider 文案和状态表达。
- Codex ACP、Codex sandbox/approval 配置与 OpenACP 的公开能力。

此次调研不覆盖：

- Codex 与 Kimi 的模型效果、成本和性能对比。
- 真实 Codex ACP permission payload、session replay 和异常事件样本。
- 服务端无头认证、生产部署和真实 Ticket 回写联调。

## Terminology and conclusion

“openacp + codex”至少可能指两种不同方案：

1. `@agentclientprotocol/codex-acp`：把 Codex CLI / App Server 暴露为 stdio ACP agent，能直接接入 Octo 现有 ACP client 链路。
2. OpenACP：面向 Telegram、Discord、Slack 等渠道的自托管会话与 agent bridge，自身还包含会话持久化、流式传输、权限控制和 REST/CLI 接口。

推荐 Octo 优先采用第一种：由 Server 直接启动 `codex-acp`，保持现有 FE -> Server -> ACP 边界。除非明确需要多聊天渠道或独立 agent gateway，否则不建议在 Octo Server 与 Codex 之间再加入 OpenACP daemon，因为它会与 Octo 当前的会话、SSE、权限和持久化职责重叠。

## Current coupling inventory

主要耦合点包括：

- `server/src/adapters/kimi-acp/kimi-acp-runtime.ts`：Kimi ACP runtime。
- `server/src/adapters/kimi-acp/spawn-config.ts`：进程命令、参数和环境变量；已经支持 `KIMI_ACP_COMMAND`、args/env JSON 覆盖，可用于低成本 smoke test。
- `server/src/application/services/acp-kimi-proxy.service.ts`：Kimi 命名的代理服务。
- `server/src/application/services/acp-kimi-permission-policy.ts`：当前权限请求解析和 action-scoped 决策。
- `server/src/adapters/kimi-acp/session-export.ts`：调用 `kimi export`，解压并解析 `wire.jsonl` 的 provider-specific 历史降级路径。
- Kimi session registry、history service、ownership store、controller、DTO/event stream 和相关测试。
- 数据库中的 `acp_kimi_session_owners`、`kimi_work_dir` 等名称。
- Ticket 前端中的 “Kimi ACP AI Chat”“Kimi 正在生成”等文案。

按本次检索口径，核心实现、测试和相关前端约涉及 29 个文件、5,585 行代码。该数字描述潜在影响面，不等于所有代码都需要修改。

## Options and estimates

以下均按一名熟悉仓库的工程师估算，包含必要测试，不包含模型效果调优，也不是交付承诺：

| 方案 | 预计文件数 | 预计改动行数 | 预计工期 | 适用目标 |
| --- | ---: | ---: | ---: | --- |
| 直接命令替换 PoC | 3–6 | 200–500 | 1–2 个工作日 | 验证握手、prompt、流式事件、权限和 session 基本兼容性 |
| 最小生产替换，暂保留 Kimi 路由/表名 | 10–16 | 1,000–1,800 | 5–8 个工作日 | 尽快让新会话稳定使用 Codex |
| provider-neutral 多 agent 重构 | 20–30 | 2,200–4,000 | 10–15 个工作日 | 长期同时支持 Codex、Kimi 或其他 ACP agent |
| 引入独立 OpenACP daemon | 25–40，另含部署配置 | 未进一步精确估算 | 3–5 周 | 确实需要跨聊天渠道、独立 gateway 或 agent switching |

## Recommended migration path

1. 利用现有命令覆盖能力，让当前 runtime 启动 `codex-acp`，只做隔离环境 smoke test。
2. 捕获真实 Codex ACP 的 permission request、session list/load、replay 和异常事件 fixture。
3. 将“业务动作允许什么”与“Kimi/Codex 请求长什么样”拆开：共享 policy decision，分别保留 provider parser/adapter。
4. 新会话切换到 Codex；旧 Kimi 会话先只读保留或隐藏，不尝试迁移上下文。
5. 运行稳定后，再统一 `kimi-*` 服务、路由、表和字段命名，形成 provider-neutral 抽象。

## Work breakdown

| 工作包 | 估算 | 说明 |
| --- | ---: | --- |
| 权限适配 | 2–3 个工作日 | 采集 Codex fixture；把 `read_only`、shell、write+shell 动作策略映射到 Codex agent mode、sandbox 和 approval；保留 action-scoped `allow_once` |
| 会话历史 | 1–2 个工作日 | 优先使用 ACP `session/list`、`session/load` 和 replay；替换或移除 `kimi export` 降级；确定旧 Kimi 会话展示策略 |
| provider-neutral 命名与持久化 | 2–4 个工作日 | 抽象 runtime、registry、permission policy；处理表、字段、路由、日志和前端文案 |
| 部署与认证 | 1–2 个工作日 | 固定 `codex-acp`/Codex 版本；定义无头认证、workspace、`/tmp`、环境变量、API URL 和 SSH key 边界；完成真实 Ticket 端到端验证 |

## Permission and security considerations

- Codex 的 `sandbox_mode`、`sandbox_workspace_write.writable_roots` 和 `approval_policy` 必须由 Octo action policy 明确映射，不能只靠 prompt 约束。
- Skill 示例可使用 `/tmp/...`，但实际运行仍应按 action/session 生成隔离目录，避免跨任务互相覆盖。
- shell、网络、工作区和宿主机边界需要在服务端容器/进程层继续约束；agent 自身配置不是唯一安全边界。
- Support QA 的签名内部 API 和 Skill 设计大体与 agent 无关，但换成 Codex 后仍需验证“生成文档 -> 调用 Octo API -> 回写数据库 -> 读取确认”的完整链路。

## Risks and open decisions

- 尚未获得真实 Codex ACP permission payload 和 session replay fixture；不能假设 ACP 通用字段足以覆盖现有 Kimi 解析逻辑。
- Kimi 与 Codex 的 session ID、上下文和历史格式不具备可移植性；默认方案是旧会话只读保留或隐藏。
- 服务端无头认证方式需要在部署前确定，不应依赖交互式浏览器登录。
- 需要决定本轮目标是“尽快单一替换”还是“顺便建设多 provider 架构”；两者修改量相差约一倍。
- 只有在业务明确需要跨聊天渠道或独立 agent gateway 时，才应重新评估 OpenACP daemon 方案。

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| Octo 当前 ACP 实现和测试静态检索 | passed | 确认 SDK、启动覆盖、权限、会话历史、持久化和前端耦合点 |
| 相关架构、生命周期和边界文档复核 | passed | 当前“扩展薄、Server 编排、adapter 处理第三方调用”的边界支持直接 ACP adapter 方案 |
| `codex-acp` 与 OpenACP 公开资料核对 | passed | 确认两者定位和职责不同 |
| Codex ACP 本地安装和握手 | not run | 本任务不安装依赖 |
| permission/session fixture 验证 | not run | 列为 PoC 必做项 |
| Lark Ticket 生成文档和 Octo 数据库回写 E2E | not run | 需在真实 Codex runtime 和授权环境中完成 |

## Progress

| Date | Status | Note |
| --- | --- | --- |
| 2026-08-24 | done | 完成静态调研、影响面盘点、方案比较和迁移估算；未做运行时改动 |

## References

- [ACP adapter for Codex](https://github.com/agentclientprotocol/codex-acp/blob/main/README.md)
- [OpenACP](https://github.com/Open-ACP/OpenACP)
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- [ACP registry](https://github.com/agentclientprotocol/registry)
- [Lark Ticket AI session permissions](./2026-08-24-lark-ticket-ai-session-permissions.md)
- [ACP design](../../tenways-octo/17-acp-design.md)
- [Detailed system architecture](../../tenways-octo/21-system-architecture-detailed.md)
