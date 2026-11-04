---
title: "数据同步页展示 Ticket 自动任务状态"
module: platform-sync
status: done
requirement_version: 2
created_on: 2026-11-04
updated_on: 2026-11-04
closed_on: 2026-11-04
owner: Codex
related:
  - "./2026-11-03-lark-thread-ticket-intake.md"
  - "./2026-11-04-lark-finished-ticket-reaction.md"
---

# 数据同步页展示 Ticket 自动任务状态

## 目标

在既有数据同步页展示自动创建 Ticket 和自动添加 Done 表情两项任务，复用已登录且具有 platformSync 权限的状态接口。本任务负责只读展示；Done 写入由后续关联任务实现后，v2 将卡片升级为实际配置及运行记录。不启用 Worker。

## 验收标准

- [x] 自动创建卡片展示配置启用状态、扫描间隔、每轮处理上限、来源数量及已有运行记录。
- [x] 自动创建运行记录使用话题登记专属 scope，与 Base 到 Octo 的快照同步区分；缺少有效租约不宣称仍在运行。
- [x] Done 卡片在关联 Worker 实现后展示实际配置与运行记录，不提供真实写入按钮；旧版本未实现投影仍兼容。
- [x] 任务状态读取失败可单独降级，保留已有数据源卡片；旧接口没有任务字段时 FE 兼容。
- [x] 相关服务端测试、FE 验证和构建通过，并记录真实运行时未验证边界。

## 背景与范围

此前页面仅展示平台数据源和 Shadow 分析。两项自动任务现有独立 coordinator scope 和 run/lease 审计；本展示流程保持现有 Web 会话与角色边界，不新增路由或依赖，不调用 Lark 写入。Done 流程的新增表由关联实现任务维护。

## 方案与决策

扩展 `GET /api/web/platform-sync-sources` 返回 `backgroundTasks`。自动创建任务从 `larkThreadTickets` 读取参数，查询 `thread-tickets:<chat>/<base>/<table>` 的运行记录；Done 从 `larkTicketDoneReaction` 读取参数，查询 `done-reactions:<base>/<table>`，展示间隔、回退窗口、目标状态及表数量。两者都不查询平台快照，状态读取独立降级，通过页面既有刷新动作更新。

Web 配置读取支持 Worker 同样使用的 `PLATFORM_SYNC_CONFIG_PATH`，并复用话题登记的 Zod 配置 schema，避免默认扫描间隔或批次数量在状态页漂移。未配置来源、配置关闭、正在执行、遗留运行状态未知、最近失败、读取暂不可用分别展示。已有运行记录可能来自自动或显式单条/区间操作，因此展示为最近任务结果，不视作进程心跳。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-04 | v1 | in_progress | 用户要求在数据同步页增加两项任务展示；已检查现有页面、状态接口与 Worker scope | 实现并执行本地验证；不启用任务或批量测试 |
| 2026-11-04 | v1 | done | 两项任务卡片及只读接口投影完成；服务端 24 个相关用例、FE 测试及前后端构建通过，治理与协议说明同步 | 未部署或运行真实平台 E2E；未启用 Worker，Done 写入仍未实现 |
| 2026-11-04 | v2 | done | 关联 Done Worker 已实现，替代 v1 的未实现占位，卡片展示实际配置与独立审计范围；22 个 controller 用例、3 个 status store 用例及 FE 测试通过 | 未部署；不提供启用或平台写入按钮 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 / 构建 | 通过 | `pnpm --dir server build`、`pnpm --dir fe check` 中的 build、`git diff --check`、相对文档链接检查 | 本地构建，不代表部署 |
| 服务端单测 | 通过，22 个用例 | `pnpm --dir server test src/modules/platform-sync/web-platform-sync.controller.test.ts src/adapters/postgres/platform-sync-status-store.test.ts` 中 controller 用例 | 配置真实临时文件读取及模拟依赖，无 Lark 调用 |
| 模拟数据库集成 | 通过，3 个用例 | 同一命令的 status store 用例 | pg-mem 验证运行审计、有效租约和不读快照，非真实 PostgreSQL |
| FE 测试 | 通过，runner 报告 51 项 | `pnpm --dir fe check`；包含实际 JSX 静态渲染和状态接口兼容用例 | 无浏览器交互或真实会话验证 |
| Live E2E / 部署验证 | 未执行 | 无外部平台写入 | 不代表已部署或 Worker 已启用 |

## 关联

- [话题登记任务](./2026-11-03-lark-thread-ticket-intake.md)
- [Done 表情设计](./2026-11-04-lark-finished-ticket-reaction.md)
- [平台同步协议与状态投影](../../tenways-octo/it-platform-sync.md)
