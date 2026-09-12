---
title: "Lark Ticket 自动同步阻塞恢复排查"
module: "platform-sync"
status: done
requirement_version: 1
created_on: 2026-09-09
updated_on: 2026-09-09
closed_on: 2026-09-09
owner: TBD
related:
  - "./2026-08-26-scheduled-platform-sync.md"
---

# Lark Ticket 自动同步阻塞恢复排查

## 目标

确认重新授权并手工同步后，已阻塞的自动同步是否会在下一周期恢复。本次只排查与说明，不修改业务代码、数据库或运行进程。

## 验收标准

- [x] 核对阻塞、轮询、手工同步和启动恢复路径。
- [x] 核对本地安全日志，说明证据边界及恢复方式。

## 背景与范围

用户报告已重新授权且执行手工同步，自动同步仍显示阻塞，怀疑此前 token 过期。

## 方案与决策

- `PostgresPlatformSyncScheduleStore.markBlocked` 将 schedule 设为 `enabled=false` 并保存 `blocked_reason`；`claimDue` 仅选择启用且无阻塞原因的计划，等待下一周期不会恢复。
- Web 手工同步仅经 coordinator 更新运行审计与 checkpoint，没有解除 schedule 阻塞；Lark 授权路径也没有 schedule 恢复调用。
- Worker 启动调用 `reconcileConfigSchedules`，为配置中启用的计划重新设为 enabled 并清空阻塞、重试次数。因此凭证可用且对应配置仍启用时，重启独立 Worker 可恢复调度；该操作会恢复配置中的所有计划。后台使用 `PLATFORM_SYNC_MASTER_USER_ID`，手工同步使用当前会话身份，手工成功不能单独证明后台身份可用。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-09 | v1 | done | 本地 9 月 7–9 日日志中，Lark 在 9 月 7 日 13:40:45 成功，13:50:55 进入 `server.sync.schedule_blocked`，错误码 `SYNC_FAILED`，随后未见新的 Lark schedule 执行。时间沿用日志原值。 | 通用错误码不足以证明 token 过期；未查询当前数据库、未重启或验证恢复后的真实同步。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 已确认 | `server/src/adapters/postgres/platform-sync-schedule-store.ts`、`server/src/application/services/platform-sync-worker.ts`、`server/src/scripts/platform-sync-worker.ts`、`server/src/modules/platform-sync/web-platform-sync.controller.ts`、Lark 授权路径 | 当前工作区代码；未修改实现或运行测试。 |
| 本地日志 | 已确认阻塞事件 | `server/logs/app.2026-09-07.*.log` 至 `app.2026-09-09.*.log`，仅提取时间、stage、platform、status、errorCode、trigger、attempt、retryCount | 不输出凭证、身份资料或原始错误载荷；不能证明授权过期根因。 |

## 关联

- [原定时同步任务](./2026-08-26-scheduled-platform-sync.md)
- [平台同步说明](../../tenways-octo/it-platform-sync.md)
