---
title: "GitHub PR main 快速筛选"
module: "platform-data"
status: done
requirement_version: 2
created_on: 2026-08-28
updated_on: 2026-08-28
closed_on: 2026-08-28
owner: Codex
related: []
---

# GitHub PR main 快速筛选

## 目标

在 GitHub PR 列表增加 `main` 快速筛选，只显示目标分支为 `main` 的 PR。保持现有 Quick Filter 的单选、再次点击取消和页面状态恢复行为，不改变 Server 查询协议。

## 验收标准

- [x] GitHub PR 快速筛选栏显示 `main`。
- [x] `main` 仅匹配 `baseRef=main` 的 PR，不限制 Open、Closed 或 Merged 状态。
- [x] 目标分支不是 main 的 PR 不匹配。
- [x] `main` 不依赖用户关联 GitHub ID，并支持再次点击取消。
- [x] FE 单元测试和 production build 通过。

## 背景与范围

GitHub PR 列表已有 Open、Mine、My Open 三个 FE Quick Filter。同步快照以 `baseRef` 保存目标分支。本次沿用现有已加载结果集上的 FE 快速筛选边界。

## 方案与决策

v1 要求 `state=merged` 且 `baseRef=main`，已被 v2 superseded。v2 的稳定 key `main` 仅使用严格条件 `item.baseRef === "main"`，不限制 PR 状态。筛选按钮不要求 GitHub ID，其他交互与现有 Quick Filter 保持一致。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-28 | v1 | in_progress | 已增加 `main` Quick Filter、匹配逻辑和正反例单测。 | 待完成 FE 验证。 |
| 2026-08-28 | v1 | done | `main` Quick Filter 已完成；沿用现有单选、再次点击取消、页码复位和页面状态恢复行为。 | 未执行登录态浏览器交互验收。 |
| 2026-08-28 | v2 | in_progress | 需求修正为只匹配 `baseRef=main`，移除 merged 状态限制。 | 待完成 FE 验证。 |
| 2026-08-28 | v2 | done | `main` 只判断目标分支；Open、Closed、Merged 的 main PR 均命中，其他目标分支不命中。 | 未执行登录态浏览器交互验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测 / 构建 | 通过 | `pnpm --dir fe check`：23/23 test files passed；Vite production build passed。 | 未执行登录态浏览器交互验收。 |
| FE 单测 / 构建（v2） | 通过 | `pnpm --dir fe check`：23/23 test files passed；Vite production build passed。覆盖三种 PR 状态的 main 分支正例和 release 反例。 | 未执行登录态浏览器交互验收。 |

## 关联

- `fe/src/pages/PlatformListPage.jsx`
- `fe/src/lib/github-pull-request-filters.js`
- `fe/src/lib/github-pull-request-filters.test.js`
- `docs/tasks/platform-sync/2026-08-27-list-view-kanban-and-grouping.md`
