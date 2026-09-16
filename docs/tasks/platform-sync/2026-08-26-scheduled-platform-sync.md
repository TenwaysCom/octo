---
title: "平台数据后台定时增量同步"
module: "platform-sync"
status: done
created_on: 2026-08-26
updated_on: 2026-08-26
closed_on: 2026-08-26
owner: TBD
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# 平台数据后台定时增量同步

## 目标

为 Lark、Meegle 与 GitHub 平台快照增加独立后台 Worker 驱动的定时增量同步，复用现有同步、清洗和 checkpoint 语义，并让 Web 手动同步与定时同步共享 scope 互斥和运行审计。

不在本次范围内：周期性 full/reconcile、Webhook 消费、浏览器端调度配置 UI、外部平台写回。

## 验收标准

- [x] 独立 Worker 可按持久化 schedule 触发已配置 scope 的增量同步。
- [x] 同一 `platform + scopeKey` 的 Web、CLI 和定时同步不能并发执行。
- [x] Web 可看到后台运行、调度和失败状态；后台运行时禁用“立即同步”，竞态请求由 Server 返回 409。
- [x] 同步与清洗成功后才推进 checkpoint；失败保留旧水位并记录安全错误。
- [x] 任务状态、触发来源、计数、心跳和错误可在 `platform_sync_runs` 审计。
- [x] Worker 为每次定时任务输出成对的开始/结束结构化日志，结束日志包含结果和耗时。
- [x] 本地 PM2 ecosystem 配置统一维护 API Server 和定时同步 Worker，仅从 `server/.env` 解析 `NODE_ENV` 作为同机环境名称后缀，不加载其他敏感变量。
- [x] Server 相关单测与 TypeScript build 通过。

## 背景与范围

现有 CLI 与 Web 已能按 checkpoint 增量同步，但 checkpoint 更新没有 scope 互斥，Web 路径没有 run audit，Server 也没有 scheduler。当前 full 语义对终态和 GitHub open PR 的覆盖不完整，因此第一阶段只调度 incremental。

## 方案与决策

- 使用 PostgreSQL 保存 schedule、run 和带 fencing token 的 scope lease，不新增队列依赖。
- 使用独立 Worker 轮询到期 schedule；API Server 不运行进程内业务定时器。
- 抽出统一的 `PlatformSyncCoordinator` 处理租约、checkpoint、审计和错误落库。
- Worker 启动时从本地非敏感 target 配置同步 schedule；身份通过 Server 环境变量显式提供。
- 错过的调度周期合并为下一次运行，不补排多个历史任务。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-26 | in_progress | 已确认现有 Service、checkpoint、run audit、Web 手动同步和 PM2 部署边界。 | 实现 store、协调器、Worker、测试与部署入口。 |
| 2026-08-26 | done | 已实现 schedule/run/lease 持久化、checkpoint CAS、Web/CLI/Worker 统一协调器、退避/阻塞、FE 状态轮询与运行中禁用、PM2 Worker 与配置文档；78 个聚焦测试和 Server/FE build 通过。 | 未启用真实 schedule，也未做外部平台授权运行验证；周期性 reconcile 另做。 |
| 2026-08-26 | done | 新增 `ecosystem.config.cjs`，统一定义单实例 API Server 与 Worker；进程名使用 `NODE_ENV` 后缀，只读取该字段，不把 `.env` 密钥载入 PM2 配置环境。 | 当前环境未安装 PM2，未实际启动进程。 |
| 2026-08-26 | done | 修复 PM2 fork 入口识别以及 enabled polling、disabled wait 的事件循环保活；重建后 Worker 跨多个轮询保持同一 PID、`online`、`restartTime=0`，并完成真实三平台 schedule。 | 后续按 app 日志和 FE 状态持续观察定时运行。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 聚焦单测 | 通过 | 14 files / 78 tests passed | pg-mem/mock，不证明外部平台连通性 |
| Server build | 通过 | `pnpm --dir server build` | TypeScript 静态验证 |
| FE check | 通过 | 19 tests passed；`pnpm --dir fe build` | 未做真实浏览器联调 |
| Diff / 部署脚本 | 通过 | `git diff --check`；两个生产部署脚本 `bash -n` | 未实际执行 PM2 部署 |
| Server 全量测试 | 有既有环境失败 | 520 passed；6 个 SQLite suite 缺 `node:sqlite`；1 个 logger 文件时序断言失败 | 新增与相关同步测试全部通过 |
| Worker 真实运行 | 通过 | PM2 Worker 保持 `online`、同一 PID、`restartTime=0`；结构化日志记录 Lark、Meegle、GitHub schedule 成功 | 仅验证当前 staging 配置，仍需持续观察生产节流 |

## 关联

- [平台同步说明](../../tenways-octo/it-platform-sync.md)
