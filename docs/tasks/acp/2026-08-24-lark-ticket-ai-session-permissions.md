---
title: "核对并修复 Lark Ticket AI Session ACP 权限"
module: acp
status: done
created_on: 2026-08-24
updated_on: 2026-08-24
closed_on: 2026-08-24
owner: TBD
related:
  - "../../tenways-octo/it-platform-sync.md"
  - "../../tenways-octo/history/18-acp-pm-analysis-skill-notes.md"
  - "../../superpowers/plans/2026-03-31-kimi-acp-backend-bridge-implementation-plan.md"
---

# 核对并修复 Lark Ticket AI Session ACP 权限

## 目标

核对历史 ACP 权限设计、当前 Ticket AI Session 权限上下文和真实 permission 请求，解释为何已配置的执行/文件修改能力仍被拒绝；在确认边界后修复 Support-QA 文档动作所需的 `/tmp/support-qa/` JSON 读写与 update 链路。

不在本次范围内：向所有普通自由对话 Session 默认开放任意 shell 或任意仓库写权限；修改 Lark Base、Meegle 或其他外部平台权限。

## 验收标准

- [x] 历史文档与当前实现的权限边界差异有明确结论和代码证据。
- [x] 普通 Session、查询快捷动作、生成文档快捷动作的权限策略分别有明确说明。
- [x] `write+shell` 仅允许 Support-QA 文档目录及 `/tmp/support-qa/` 受限 JSON 流程，并拒绝越界、嵌套和符号链接。
- [x] 相关回归测试、Server build 和 Skill 校验通过；全量测试的非本次失败已单独记录。
- [x] 静态验证与实际部署/运行时验证边界分开记录。

## 背景与范围

当前 Server 已有 `read_only`、`shell`、`write+shell`、`full` 四级策略和 Session 权限快照。现有运行日志显示部分带 `shell` 的快捷动作仍返回 `policy_denied`；同时 Support-QA Skill 使用临时 JSON 交换证据和更新 payload，当前路径约束与 Skill 示例不一致。

## 方案与决策

- 先以历史设计、提交记录、当前代码和脱敏运行日志确认根因，不把“有策略枚举”等同于“真实工具调用已获批”。
- 临时交换区只考虑 `/tmp/support-qa/` 的直接 `.json` 子文件；不放开整个 `/tmp`。
- 保持普通无 action Session 默认 `read_only`，是否扩大普通会话权限需独立产品/安全决策。

## 结论

- 2026-03 的历史草案只表达了原则：action skill 风险最高、必须有 permission/approval，并明确把 approval 落在 popup、backend 还是 ACP runtime 留作问题。因此当时并未形成可实施的完整权限契约。
- 2026-08 的权限提交和当前平台文档已经明确产品边界：普通 Session deny-by-default；查询快捷动作使用 `shell`；生成文档快捷动作使用 `write+shell`；权限随 Session 保存，并且每次只能选择 `allow_once`。
- 缺口在协议和路径契约：文档没有记录 Kimi 0.22 的真实 `ToolCallUpdate` 可能没有 `rawInput`，也没有统一 Skill 临时文件路径。现有 handler 因此无法从真实请求提取命令/路径，同时只识别旧工具名 `Bash`，导致已绑定策略的快捷动作仍被拒绝。
- 本次保持上述产品边界不变，只补真实 ACP shape 兼容、受限 `/tmp/support-qa/` JSON 流程和对应文档。没有给普通自由对话 Session 开放 shell 或写权限。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-24 | in_progress | 已核对当前 action catalog、Session 权限快照、ACP permission handler、历史提交 `b1f1b26` 和脱敏 permission 日志；已发现路径契约不一致，正在继续确认历史设计完整度与真实拒绝原因。 | 尚未完成代码验证；未做已部署运行时复测。 |
| 2026-08-24 | in_progress | 历史方案在 2026-03 仍把 write-action approval boundary 标为未决；提交 `b1f1b26` 首次明确普通 Session deny-by-default、快捷动作策略快照与逐次 `allow_once`。真实 Kimi ACP 0.22 permission 请求不带 `rawInput`，而现有策略只从 `rawInput` 取命令/路径，导致已匹配 `shell`/`write+shell` 的调用仍被拒绝。 | 补真实 Kimi permission shape 测试，完成实现与运行时复测。 |
| 2026-08-24 | done | Handler 已兼容真实 Kimi `Shell` text content、`WriteFile`/`StrReplaceFile` diff path 和旧版 `rawInput`；`/tmp/support-qa/` 仅允许直接普通 `.json` 文件，update 必须使用已有文件；Skill 示例已同步。相关 12 个回归用例、Server build、Skill 校验和 diff check 通过。 | 未对真实 Ticket 执行生成文档或写回；需部署后由有权用户选择测试 Ticket 做运行时复测。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 通过 | 当前代码、历史文档、Git 提交；两仓库目标文件 `git diff --check` | 不能证明部署环境已生效。 |
| 相关回归测试 | 通过 | 4 个测试文件、12 个用例通过，覆盖 action policy、Session 权限快照、真实 Kimi permission shape 和临时文件安全边界 | 使用 fixture，没有启动真实 Kimi/Ticket 写回。 |
| Server build | 通过 | `pnpm --dir server build` | 仅证明 TypeScript 构建。 |
| Skill 校验 | 通过 | `quick_validate.py` 返回 `Skill is valid!` | 只验证 Skill 结构，不执行其外部写操作。 |
| Server 全量测试 | 未全绿 | 109 个测试文件、507 个用例通过；6 个 SQLite suite 因当前 Node 未启用 `node:sqlite` 失败，另有 1 个既有 logger 文件生成时序用例失败 | 失败不涉及本次权限文件；相关回归均通过。 |
| 已部署运行时验证 | 未执行 | 未选择真实 Ticket，未触发外部或仓库写入 | 部署后仍需一次受控复测。 |

## 关联

- [平台同步与 Ticket AI Session 说明](../../tenways-octo/it-platform-sync.md)
- [ACP 与 Skills 历史讨论](../../tenways-octo/history/18-acp-pm-analysis-skill-notes.md)
- [Kimi ACP backend bridge 历史实施计划](../../superpowers/plans/2026-03-31-kimi-acp-backend-bridge-implementation-plan.md)
