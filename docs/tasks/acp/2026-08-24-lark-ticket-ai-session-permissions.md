---
title: "重构 Lark Ticket AI Session ACP 权限"
module: acp
status: in_progress
requirement_version: 5
created_on: 2026-08-24
updated_on: 2026-09-04
owner: TBD
related:
  - "../../tenways-octo/it-platform-sync.md"
  - "../../ai-dev/lifecycle/current-system-technical-objects.md"
  - "../../ai-dev/rules/server-code-rules.md"
---

# 重构 Lark Ticket AI Session ACP 权限

## 目标

移除 Octo ACP 的 MCP 权限与执行链，使用 Server 所有的版本化权限 Profile、ACP fs 和受控 Terminal 支撑 Support-QA Answer/Document。所有外部写入改为 effect draft → 人工确认 → Server 执行/readback，不能由 Kimi Terminal 直接完成。

## 根因与决策

- 历史 `read_only | shell | write+shell | full` 只描述了意图；Octo 没有实现 ACP Terminal，因此给 action 标记 `shell` 并不能让 Kimi 的 Bash 真正执行。
- Kimi 0.38 permission request 还可能只给截断摘要。工具名、摘要或 tool-call 文本不能用于安全批准，也不能作为执行成功证据。
- Octo 不再提供 MCP 功能：删除 execute MCP builder、stdio server、manifest 和专项测试；ACP `mcpServers` 固定为空。
- Kimi Bash 统一走 ACP Terminal。Server 必须取得完整命令，规范化为 argv，匹配当前 Action/Profile/Ticket/action run/cwd/脚本/参数规则，再以 `shell: false` 执行。
- `lark-ticket-support-qa-summarize` 继续走现有 DeepSeek 结构化流程，不进入本次 Kimi ACP 权限链。

## 权限 Profile

| Profile | Write | Terminal |
| --- | --- | --- |
| `acp.chat-readonly.v1` | 禁止 | 禁止 |
| `support-qa.answer.v1` | 仅当前 action run 临时目录 | 当前 Ticket fetch、`git status`、受限 diff |
| `support-qa.document.v1` | 临时目录，以及 `qa-cards/**/*.md`、`indexes/*.md`、`faq.md` | Answer 命令，加确定性 Eval、update/analysis-update dry-run |

临时目录固定为 `os.tmpdir()/octo-support-qa/<actionRunId>/`。Answer 不得写知识库；Document 不得写 `knowledge-index.jsonl`。旧 `execution_policy` 只保留为历史列；缺少 `permission_profile_id/version` 的 Session 只能只读追问，Write/Terminal 返回 `ACP_SESSION_PERMISSION_UPGRADE_REQUIRED`。

## 实现范围

1. 删除 ACP MCP 配置、脚本、manifest、imports、prompt/Skill 指令和基于 MCP tool call 的完成判定。
2. ACP runtime 动态声明 fs/terminal；实现 create/output/wait/kill/release、单 Session 单进程、60 秒超时、256 KiB 输出上限和关闭清理。
3. Write 只接受 256 KiB 内 UTF-8 文本；逐次校验 traversal、realpath、symlink 和敏感路径；scratch 使用 `0700`，文件使用 `0600`。
4. 用 `AcpKimiOperationAuditStore` 记录真实 Terminal start/exit；`support_qa.fetch` 的 completed 记录是 workflow 成功门禁。
5. Kimi 写固定 `effect-draft.json`；Server 持久化身份/snapshot/hash。确认 API 不接受新 payload，Server 完成 feedback 或 Ticket AI 写入和 readback；Document 成功后才更新 index。
6. Action catalog 保存 `permissionProfileId`，Session 保存 Profile id/version 和 action run；浏览器 public config 不暴露内部权限字段。

## 验收标准

- [x] execute MCP 服务、stdio 脚本、manifest 和专项测试已删除；新/恢复 ACP Session 的 `mcpServers` 固定为空。
- [x] 三个版本化 Profile 与 Action/Profile/version fail-closed 校验已实现。
- [x] ACP Write 和 Terminal 路径、参数、symlink、敏感文件、超时、输出和进程生命周期边界已实现。
- [x] Terminal 使用完整 argv 白名单与 `shell: false`，不接收模型 env，不开放 stdin。
- [x] fetch 完成门禁改为检查真实执行账本，不再读取 tool-call 文本。
- [x] effect draft 存储、查询、确认、snapshot/hash/ownership 校验、readback、分段恢复和 unknown-outcome 锁定已实现。
- [x] Support-QA prompt、两份 Skill、系统生命周期、Server 规则和平台架构文档已同步。
- [x] Server focused/full tests 与 build 通过。
- [x] FE tests/build 与 Extension tests/typecheck/build 通过。
- [ ] 真实 Kimi 0.40.1 Answer/Document Session 完成受控运行时验收。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-24 至 2026-08-28 | superseded | 先后实现 permission rawInput 解析、Kimi 0.38 tool-call 关联及临时 Bash/MCP 方案；运行时暴露出 Octo 无 ACP Terminal、permission 摘要不足以安全批准的问题。 | 旧策略被本次 v5 设计替代，不再作为现行权限边界。 |
| 2026-09-04 | in_progress | 已完成 MCP 链删除、Profile/fs/Terminal、执行账本、Session 快照、effect draft/确认 API、FE 确认入口以及 Support-QA Skill/架构文档同步。本地 focused/full/build 和前端/插件验证全绿；额外修复 action scratch symlink 根、fetch 输出未进入 action scratch、NVM 可执行路径和普通会话未保存 readonly Profile 四个边界。 | 尚未运行真实 Kimi/Ticket 外部验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态边界 | 通过 | 无可达 execute MCP 配置/调用、无 `temporary_unverified_bash`、无新 action `executionPolicy`；Skill transport `node --check`、wrapper `bash -n`、两仓库 `git diff --check` 通过 | 历史 DB 列、历史任务记录和本任务迁移说明允许保留。 |
| Server focused tests/build | 通过 | 核心权限/Runtime/Session/effect draft/DB/controller 用例通过；`pnpm --dir server build` 通过 | 使用 fixture，不证明真实 Kimi 或 Lark。 |
| Server full tests | 通过 | 147 个测试文件、718 个用例通过 | 本地测试环境，无部署证明。 |
| FE / Extension | 通过 | FE 147 tests + Vite build；Extension 45 files/282 tests、typecheck、WXT build | 不证明外部写回。 |
| 真实 Kimi 0.40.1 | 部分确认 | 本机 `kimi --version` 为 `0.40.1`；尚未新建 Answer/Document Session | 必须选择真实 Ticket 并触发受控外部读取；当前没有运行外部验收。 |

## 运行时验收清单

1. 新建 Answer Session：scratch Write 成功；知识库 Write 拒绝；当前 Ticket fetch 退出码 0 且 audit 为 completed；其他 Ticket/任意 shell 拒绝。
2. 新建 Document Session：允许 Markdown 目标和 dry-run/Eval；`knowledge-index.jsonl`、非 dry-run、`record-upsert`、`--writeback`、`--allow-external-ai` 拒绝。
3. 生成 effect draft 后在 FE 确认：校验当前 snapshot/hash，Server 执行并 readback；Document 只在 Ticket AI 成功后更新 index。
4. 断连/关闭时确认子进程终止；超时/非零/输出截断均返回稳定错误且 audit 记录真实终态。

## 关联

- [平台同步与 Ticket AI Session 说明](../../tenways-octo/it-platform-sync.md)
- [当前系统技术对象](../../ai-dev/lifecycle/current-system-technical-objects.md)
- [Server 代码规则](../../ai-dev/rules/server-code-rules.md)
