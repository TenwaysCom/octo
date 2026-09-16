---
title: "设置入口默认打开数据同步"
module: "platform-sync"
status: done
requirement_version: 1
created_on: 2026-09-04
updated_on: 2026-09-04
closed_on: 2026-09-04
owner: Codex
related:
  - "fe/src/components/layout/WorkspaceShell.jsx"
  - "fe/src/app/routes/workspace-routes.js"
---

# 设置入口默认打开数据同步

## 目标

点击工作台侧栏“设置”时，拥有同步权限的用户默认进入 `#sync` 数据同步页；没有该权限的用户保留在可访问的平台授权页。

## 验收标准

- [x] 有 `platformSync` 权限时，设置入口链接为 `#sync`。
- [x] 无 `platformSync` 权限时，不暴露不可访问的同步默认页。
- [x] FE 路由测试与构建通过。

## 背景与范围

侧栏设置入口此前固定链接到 `#integrations`，与数据同步作为设置默认落点的预期不一致。本次只调整入口默认目标，不改变各设置子页或同步页面的权限规则。

## 方案与决策

在现有 workspace route 模块中集中解析设置默认路由：有 `platformSync` 权限时选 `sync`，否则回退 `integrations`。侧栏复用该解析结果，避免把权限分支散落在组件内。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-04 | v1 | in_progress | 已将设置默认路由集中到 route 模块，并接入侧栏。 | 运行 FE 测试与构建。 |
| 2026-09-04 | v1 | done | 有同步权限时设置链接为 `#sync`；无权限时回退 `#integrations`。 | 未做登录态浏览器视觉验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 路由测试 / 构建 | 通过 | `pnpm --dir fe check`：33 tests passed；Vite production build passed。 | 未做登录态浏览器视觉验收。 |

## 关联

- [平台同步说明](../../tenways-octo/it-platform-sync.md)
