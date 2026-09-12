---
title: "Meegle 工作项快速关联 PR"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-09-01
updated_on: 2026-09-01
closed_on: 2026-09-01
owner: TBD
related:
  - "docs/tasks/platform-data/2026-08-29-meegle-page-performance.md"
  - "docs/tasks/platform-data/2026-08-31-show-meegle-workitem-system.md"
---

# Meegle 工作项快速关联 PR

## 目标

在 `#meegle-workitems` 显示工作项创建时间，并让用户通过空 PR 图标或快捷键 `g` 从当前工作项 System 对应仓库的 open/draft PR 中快速选择关联项。选择后，GitHub PR 标题必须包含精确的 `m-<workItemId>` 标记，本地同步快照随即更新。

## 验收标准

- [x] Meegle 工作项列表默认显示可配置、可排序的创建时间。
- [x] 未关联 PR 的列表行保留可点击 PR 图标，已有 PR 的展示保持不变。
- [x] 悬停或聚焦工作项后按 `g`，或点击空 PR 图标，可打开 PR 选择 popup。
- [x] popup 只显示工作项 System 对应仓库的 open/draft PR，并展示 PR ID、author、head branch 到 base branch。
- [x] 选择 PR 后，标题缺少 `m-<workItemId>` 时由 Server 追加；已有精确标记时不重复修改。
- [x] 相关 Server、FE 测试与 build 通过。

## 背景与范围

Meegle 列表已从本地 PostgreSQL 快照读取工作项和关联 PR 摘要，关联关系由 GitHub PR 标题/描述里的 `m-<id>` 或 `f-<id>` 标记投影。此次复用本地 GitHub PR 快照提供候选项；GitHub 标题写入仍由 Server adapter 执行，不在 FE 硬编码仓库映射或直接调用 GitHub。

不修改 Extension，不新增 Meegle 字段写入，也不在候选 popup 读取 Odoo.sh 状态。

## 方案与决策

- Meegle 同步对象增加规范化 `createdAt`，PostgreSQL 快照增加独立 `created_at` 列，避免列表读取完整 source payload。
- System 到 GitHub 仓库的选择复用 Server 的 Odoo 环境映射；候选查询限定为本地 open/draft 快照。
- 关联动作携带 `actionRunId`。Server 重新读取 GitHub PR 最新值，按需追加 `m-<workItemId>`，随后 UPSERT 返回值以立即刷新关联投影。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-01 | v1 | done | 创建时间投影、空 PR 图标、`g` 快捷键、候选 popup、GitHub 标题标记与本地快照即时刷新均已实现。 | 未调用真实 GitHub API，也未执行登录态浏览器视觉验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 定向测试 | 通过 | `pnpm --dir server exec vitest run ...`：8 files / 76 tests | 使用 mock GitHub API 与 pg-mem；未写真实 GitHub。 |
| Server build | 通过 | `pnpm --dir server build` | TypeScript 编译通过。 |
| FE test | 通过 | `pnpm --dir fe test`：27 files passed | Node 单测，不含登录态 DOM 视觉验收。 |
| FE build | 通过 | `pnpm --dir fe build` | Vite production build 通过。 |
| Server 全量测试 | 环境受限 | 617 tests passed；6 个既有 SQLite suites 因当前 Node 无 `node:sqlite` 未加载，既有 logger dated-file 用例失败 | 与本次变更相关用例均通过；需在项目标准 Node runtime 完成全量绿灯。 |

## 关联

- [Meegle 页面性能](./2026-08-29-meegle-page-performance.md)
- [显示 Meegle System](./2026-08-31-show-meegle-workitem-system.md)
