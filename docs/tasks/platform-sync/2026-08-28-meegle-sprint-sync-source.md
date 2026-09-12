---
title: "数据同步页增加 Meegle Sprint"
module: "platform-sync"
status: done
requirement_version: 1
created_on: 2026-08-28
updated_on: 2026-08-28
closed_on: 2026-08-28
owner: Codex
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# 数据同步页增加 Meegle Sprint

## 目标

在现有数据同步页展示独立的 Meegle Sprint 同步状态，并允许 DevOps 用户通过同一页面只触发 Sprint scope 的增量同步；不改变 Sprint 快照、历史或生命周期清洗规则。

## 验收标准

- [x] `#sync` 返回并展示 `Meegle Sprint` 数据源卡片及其最近同步、任务和调度状态。
- [x] 点击该卡片的“立即同步”只执行配置中的 Sprint type checkpoint scope。
- [x] 未配置 Sprint type 时卡片显示未配置且动作不可用。
- [x] Server 定向测试、Server build 和 FE check 通过。

## 背景与范围

Sprint type 已存在于本地 Meegle 同步配置、调度器和 `meegle_workitem_syncs` 快照链路中。数据同步页使用服务端 source catalog 通用渲染卡片和动作，本任务只补齐 Web source catalog 与相应测试，不在 FE 增加按 source id 的业务分支，也不写入 Meegle 业务字段。

## 方案与决策

Server 将稳定的 Sprint type key 映射为 `meegle-sprints` source，状态 scope 使用 `<projectKey>/<sprintTypeKey>`，手动动作复用 `PlatformSyncCoordinator.runIncremental` 与现有 Meegle 增量服务。FE 继续根据 `/api/web/platform-sync-sources` 返回值自动渲染并调用通用 POST route。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-28 | v1 | done | 已补充 Meegle Sprint source、状态投影、独立增量动作和未配置保护；定向测试 11/11、Server build、FE 23 个测试文件及生产构建通过。 | 未做已登录浏览器交互验收，也未触发真实 Meegle 同步。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 定向测试 | 通过 | `pnpm --dir server exec vitest run src/modules/platform-sync/web-platform-sync.controller.test.ts`：11/11 passed。 | 使用注入的同步服务与 coordinator，未访问真实 Meegle。 |
| Server build | 通过 | `pnpm --dir server build`。 | TypeScript 静态验证。 |
| FE test / build | 通过 | `pnpm --dir fe check`：23 个测试文件通过，Vite production build 通过。 | 页面使用通用 source 渲染；未做已登录浏览器视觉与点击验收。 |
| Server 全量测试 | 存在既有环境失败 | 578/579 tests passed；本任务 11 项全部通过。 | 当前 Node 缺少 `node:sqlite`，6 个既有 SQLite suites 无法加载；`src/logger.test.ts` 的 dated log 落盘时序断言失败。 |

## 关联

- `server/src/modules/platform-sync/web-platform-sync.controller.ts`
- `server/src/modules/platform-sync/web-platform-sync.controller.test.ts`
- `fe/src/pages/SyncStatusPage.jsx`
- `docs/tenways-octo/it-platform-sync.md`
