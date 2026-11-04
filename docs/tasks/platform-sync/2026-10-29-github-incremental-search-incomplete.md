---
title: "GitHub EU、UK 增量搜索失败与定时任务停用排查"
module: platform-sync
status: done
requirement_version: 2
created_on: 2026-10-29
updated_on: 2026-10-29
closed_on: 2026-10-29
owner: TBD
related:
  - "server/src/adapters/github/github-client.ts"
  - "server/src/application/services/platform-sync-worker.ts"
  - "server/src/adapters/postgres/platform-sync-schedule-store.ts"
---

# GitHub EU、UK 增量搜索失败与定时任务停用排查

## 目标

排查 EU、UK 同步的 `GITHUB_INCREMENTAL_SEARCH_INCOMPLETE`，确认触发条件、当前影响及恢复方向。v2 用户明确要求先恢复同步，下次再出现错误时再修复；本次只恢复 EU、UK 调度并核验实际同步，不修改业务代码或错误处理逻辑。

## 验收标准

- [x] 关联报错日志、同步审计、checkpoint 和 schedule 状态。
- [x] 复现 adapter 错误与 Worker 分类，并只读验证当前 GitHub 搜索。
- [x] 区分已证实的停同步原因与原始触发推断，记录恢复建议及边界。
- [x] 重新启用 EU、UK 两个指定的定时任务，清除对应阻塞原因，保留原 checkpoint 和 10 分钟周期。
- [x] 确认现有 Worker 实际执行恢复后的同步成功，回读审计、checkpoint 与调度状态。

## 方案与决策

- 诊断阶段使用只读数据库事务查询安全字段；GitHub 仅 GET 搜索，不输出凭据、PR 内容或响应全文。v2 恢复阶段仅更新两个指定 schedule，由现有 Worker 执行原有增量同步。
- 当前 adapter 将 `incomplete_results=true` 和 `total_count>1000` 合为一个错误。Worker 不将其识别为可重试错误，调用 `markBlocked` 将 `enabled=false`，后续轮询不再选中。
- 后续再次出现错误时再修复（用户 v2 决定）。技术候选方向仍是区分临时搜索不完整与数量超限，具体方案届时按新证据确定。本次不改错误处理，不跳过报错推进 watermark。
- v1 的“仅诊断、不执行恢复”范围已被 v2 替代：恢复操作以事务锁定两个指定 schedule，仅在仍被本错误阻塞或已正常启用时继续；设置 enabled=true、blocked_reason=null、retry_count=0、next_run_at=当前时间，保留 checkpoint 和周期。重复执行不新增任务；若同步失败保留现有 Worker 的错误处理，不反复解锁。需要回退时仅重新停用这两个 schedule，不回退已经合法完成的快照同步。
- 手动同步入口只执行 coordinator，不会重新启用 schedule；EU 的实际记录符合这一行为。

## 诊断结论

以下时间均为 UTC+8：

| 仓库 | 失败并停用时间 | 最近成功同步 | 10 月 29 日调度状态 |
| --- | --- | --- | --- |
| EU `TenwaysCom/Tenways` | 10 月 23 日 00:55:34 | 10 月 28 日 13:52:33，手动同步 9 条 | enabled=false，blocked_reason 为该错误，retry_count=0 |
| UK `TenwaysCom/tenways-ukk` | 10 月 23 日 00:50:59 | 10 月 23 日 00:40:46，定时同步 1 条 | enabled=false，blocked_reason 为该错误，retry_count=0 |

失败 actionRunId：EU `ca427d1a-f48e-43f6-85e3-66c467b45979`；UK `22bf8a09-79f8-4388-b3d2-2566a66154ec`。两次失败前一次定时同步均成功。US 调度仍启用并持续成功。

10 月 29 日只读调用实际编译版 `GitHubClient.listPullRequestsUpdatedSince`，使用当前 checkpoint 减 5 分钟：EU 返回 9 条、UK 返回 4 条，均 HTTP 200、`incomplete_results=false`。扩大到 `updated:>=2026-10-22T00:00:00Z` 后分别为 22 条和 5 条，也均完整。

因此持续停同步原因已确认是 Worker 将该错误归为不可重试并停用 schedule。原始触发更符合 GitHub 临时搜索超时：官方文档说明超时可返回 `incomplete_results=true`。但历史日志没有保留当时 `total_count` / `incomplete_results`，当前查询也不能重建历史搜索状态，不能将临时超时认定为已证实事实。当前读取成功不证明当时凭据及平台状态。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-10-29 | v1 | done | 核对 app.2026-10-23.1.log、platform_sync_runs/checkpoints/schedules；模拟两种搜索错误均复现相同异常及 retryable=false；真实只读搜索均正常 | 未改业务代码、未补同步、未启用调度、未部署；恢复后仍需验证定时执行 |
| 2026-10-29 | v2 | in_progress | 用户授权先恢复 EU、UK 同步，错误处理延后至下次复现；重新打开运行时验收 | 待恢复指定 schedule 并核验 Worker 执行结果 |
| 2026-10-29 | v2 | done | 15:07:19 定向恢复两个 schedule；15:07:37 现有 Worker 发起 scheduled 同步，15:07:39 均成功；15:07:44 数据库回读确认 enabled=true、blocked_reason=null、retry_count=0，周期仍为 600 秒，下一次计划 15:17:37 | 未改错误处理、未重启或部署；尚未等待下一轮 10 分钟周期，后续再报错时再修复 |

## v2 恢复证据

恢复只更新两个指定 schedule 的 enabled、blocked_reason、retry_count、next_run_at、updated_at，没有直接修改 checkpoint。现有 Worker 按原有增量路径更新快照、清洗并推进 checkpoint：

| 仓库 | run_id | actionRunId | 结果 | 同步 / 清洗 | checkpoint 源时间（UTC） |
| --- | --- | --- | --- | --- | --- |
| EU | 03f69339-d459-4318-946d-df6d08b24679 | 55bf5560-06fa-4ae0-9738-d45b5797690a | scheduled / succeeded | 9 / 9 | 2026-10-29T05:51:34Z |
| UK | d71e0d08-26c5-454c-879c-710dcf31159b | 8ab41a53-35df-4764-873b-10eaad02ed58 | scheduled / succeeded | 4 / 3 | 2026-10-29T06:48:59Z |

两者 checkpoint 的 last_error 均为空，last_success_at 均已更新至本次成功时间。同步数与清洗数为审计字段原值，不表示新增 PR 数量。

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 已核对 adapter、Worker、schedule store 与手动入口 | 上述源码及 web-platform-sync.controller.ts | 未改变契约或行为 |
| 临时 mock 复现 | 两种条件均抛出相同错误且 Worker 判为不可重试 | `LOG_LEVEL=silent node /tmp/octo-github-incomplete-repro.mjs`，退出 0，使用实际 dist 模块；完成后删除临时脚本 | 仅证明错误处理链，未重建历史 GitHub 载荷；非新增回归测试 |
| v1 运行时只读验证 | 确认两仓库停用及当前搜索成功 | 数据库只读事务、GitHub GET 的状态/数量/完整性摘要 | v1 当时未执行任何同步或恢复操作 |
| v2 已部署运行时恢复 | 两个 schedule 均恢复；现有 Worker 的两次 scheduled 同步均成功，checkpoint 与下一次运行时间已回读 | 上述 run_id / actionRunId；15:07:44 数据库只读回查 | 仅恢复运行状态，未修复原始错误处理；未等待第二轮周期 |
| 应用测试 / mock integration / live E2E / 新版本部署 | v2 未执行 | 无业务代码变更；使用现有 Worker 验证恢复 | 不宣称代码缺陷已修复 |

## 关联

- [GitHub 搜索超时与不完整结果官方说明](https://docs.github.com/en/rest/search/search#timeouts-and-incomplete-results)
- [此前 GitHub 401 排查（不同错误）](./2026-09-24-github-pr-sync-auth-failure.md)
