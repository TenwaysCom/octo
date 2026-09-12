---
title: "Server 测试 SQLite runtime 与 logger 稳定性修复"
module: "engineering-ops"
status: done
requirement_version: 1
created_on: 2026-09-04
updated_on: 2026-09-04
closed_on: 2026-09-04
owner: Codex
related:
  - "server/package.json"
  - "server/src/logger.test.ts"
---

# Server 测试 SQLite runtime 与 logger 稳定性修复

## 目标

使 `pnpm --dir server test` 在当前 Node 22.12 环境加载 legacy SQLite 测试，并消除 dated logger transport 文件断言的时序竞争。不改变生产运行时或业务行为。

## 验收标准

- [x] 默认 Server 测试命令启用 `node:sqlite` 所需运行时开关。
- [x] logger 测试只在文件已写入目标消息后断言，不依赖 transport worker 的偶然调度。
- [x] Server 全量测试和构建通过。

## 背景与范围

当前 Node 22.12 将 `node:sqlite` 置于 `--experimental-sqlite` 开关后，6 个 legacy SQLite suite 在加载前失败。`pino-roll` transport 在独立 worker 中创建日志文件，`logger.flush()` 回调后文件未必已落盘，导致 logger 用例偶发失败。

## 方案与决策

测试入口通过 `NODE_OPTIONS` 将 Node 的 SQLite 实验开关传给 Vitest 及其 worker；不对生产 `start` 或 `dev` 命令增加该开关。logger 用例以 5 秒上限轮询 dated log 文件及目标消息，超时后提供明确失败原因；用例本身允许 6 秒，以覆盖全量并发运行时 transport worker 的启动延迟。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-04 | v1 | in_progress | 已复现：6 个 SQLite suite 无法加载；1 个 logger transport 文件时序断言失败。 | 运行全量 Server 测试和构建。 |
| 2026-09-04 | v1 | done | `test` 入口通过 `NODE_OPTIONS` 让 Vitest worker 继承 SQLite 开关；logger 断言等待实际落盘内容。 | 不修改生产运行时命令。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 全量测试 | 通过 | `pnpm --dir server test`：146 files / 707 tests passed。 | 使用本地测试存储与 mock，不代表外部平台连通性。 |
| Server build | 通过 | `pnpm --dir server build`。 | TypeScript 静态验证。 |

## 关联

- [Server Code Rules](../../ai-dev/rules/server-code-rules.md)
