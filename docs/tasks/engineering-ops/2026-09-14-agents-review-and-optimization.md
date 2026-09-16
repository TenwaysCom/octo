---
title: "审查并优化根目录 AGENTS.md"
module: engineering-ops
status: done
requirement_version: 1
created_on: 2026-09-14
updated_on: 2026-09-14
closed_on: 2026-09-14
owner: TBD
related:
  - "../../../AGENTS.md"
  - "../../ai-dev/rules/development-workflow.md"
---

# 审查并优化根目录 AGENTS.md

## 目标

对照代码、脚本与现有治理文档修正根目录 Agent 指令，减少重复并明确适用范围。交付优化后的 `AGENTS.md` 和可复核的审查证据，不修改应用代码、依赖或运行环境。

## 验收标准

- [x] 项目职责、路由示例、命令与测试工具均与当前仓库一致。
- [x] 联调说明明确 Server 端口、FE origin、插件设置和授权前置条件。
- [x] 日志提取命令能处理多个轮转文件，且只输出允许的字段。
- [x] 保留原有分层、凭据保护、依赖、范围与台账约束，补充按任务选择的文档入口。
- [x] 文档链接、命令静态检查及差异检查通过，明确未做运行时验证。

## 背景与范围

审查对象是根目录 `AGENTS.md`。`CLAUDE.md` 已仅指向它，无需复制规则；现有包级文档和治理文档作为核对来源。任务记录及可复用错误签名遵守既有台账约定。

## 方案与决策

| 审查发现 | 依据 | 处理 |
| --- | --- | --- |
| 概览和命令遗漏 FE，Vitest globals 未限定包范围 | `fe/package.json` 使用 `node --test`，现有 FE 测试显式导入 `node:test` / `node:assert/strict` | 补充 FE 职责、命令，区分 Vitest 与 Node 测试入口。 |
| Extension 运行时启用 globals，但 TypeScript 未加载对应类型 | `extension/tsconfig.json` 的 types 仅含 chrome/node；现有 toolbar 测试使用三斜线类型引用，ERRORS 已收录同类失败 | 补充新测试需要显式引用 `vitest/globals` 类型的前提，保留不导入 globals 的约定。 |
| 将已移除的 `/api/lark-user-story/*` 列为当前路由 | `server/src/index.ts` 注册项及 `server/src/index.test.ts` 的 legacy 排除列表 | 使用当前已注册的具体路由，列清已移除入口并指向代码与测试核验。 |
| `make server-dev` 没有确保监听 Vite 代理目标端口 | Makefile 只转发 dev；`server/src/index.ts` 使用 `PORT` 或 `3000`；`fe/vite.config.js` 固定代理到 `3040` | 示例显式设置 `PORT=3040` 和 FE callback origin，补充插件 dev URL 与登录前提。 |
| `rg` 多文件结果默认含文件名前缀，不能直接交给 `jq` | 两个合成轮转日志复现 `jq: parse error: Invalid numeric literal`，退出码 5 | 使用 `rg --no-filename`，保留只提取非敏感字段的约束。 |
| `start` / 数据库命令依赖编译产物，`db:reset` 与普通命令混列 | `server/package.json` 使用 `dist/`；`resetPostgresDatabase()` 删除应用表后建表 | 写清 build 前置条件和 reset 的适用边界。 |
| 工作方式与范围规则重复，缺少共同工作流程和 FE 阅读入口 | 既有 `development-workflow.md`、`fe/README.md`、Tasks 台账 | 合并范围规则、增加阅读表、命令表，并链接已有规则来源。 |
| LEARNINGS 页首要求重复记录 verified outcome，与 AGENTS 的单一事实归属规则冲突 | `.learnings/LEARNINGS.md` 页首与原 Learning Ledger 对照 | 页首改为指向 AGENTS 的权威规则，保留验证证据在任务记录中的边界；不迁移历史条目。 |

保留默认 devDependencies 约定，不调整依赖策略。仅澄清纯文档变更的验证方式，不新增测试框架、子目录 AGENTS 或审批流程。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-14 | v1 | in_progress | 完成根文件、相关规则、包脚本、Makefile、路由注册/测试、Vite 配置与 logger 核对；原日志命令已用合成数据复现失败。 | 检查修改后的链接、命令、shell 语法和日志提取输出。 |
| 2026-09-14 | v1 | in_progress | 首次文档 patch 被工具拒绝：同一 patch 不能同时 Delete/Add 同一路径；改为单个 Update 后写入。 | 未影响应用文件。 |
| 2026-09-14 | v1 | in_progress | 临时验证脚本误把 `rg` 跨文件输出顺序视为固定；实际三条记录和字段均正确，改为按记录集合比对。 | 日志命令不承诺跨文件时间排序，无需增加排序行为。 |
| 2026-09-14 | v1 | done | 完成规则重组、事实修正和台账页首去冲突；链接、命令、Make dry-run、shell 语法、合成日志及差异检查通过。 | 仅文档与台账变更，未运行应用测试或真实登录流程。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态核对 | 通过 | 根文档与任务记录的 16 个相对链接、变更台账链接及锚点均存在；16 个包命令匹配 package.json；3 个 Make target dry-run 成功；2 个 shell block 经 `zsh -n` 解析通过。 | 只核对命令定义与语法，不启动服务、浏览器或数据库。 |
| 合成日志验证 | 通过 | 在临时目录执行文档原样命令：跨两个轮转文件准确提取 start/approve/complete 三条记录、每条五个允许字段，排除无关路径及合成响应体。原命令退出码 5，修正后为 0。 | 不读取真实日志、cookie、token 或用户资料；不承诺跨文件排序。 |
| 差异检查 | 通过 | `git diff --check`；AGENTS 从 136 行调整为 114 行，现有硬规则与事实归属要求已逐条复核。 | 补充 FE 与操作前提后字节数增加；未以行数减少宣称上下文 token 减少。 |
| 应用测试 / 构建 / live E2E | 未执行 | 仅修改规则文档与台账 | 不宣称登录联调通过或部署生效。 |

## 关联

- [Agent 规则入口](../../../AGENTS.md)
- [共同开发工作规范](../../ai-dev/rules/development-workflow.md)
- [FE 登录与本地联调](../../../fe/README.md)
