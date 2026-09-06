---
title: "Lark Ticket 详情页前后导航"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-09-06
updated_on: 2026-09-06
closed_on: 2026-09-06
owner: Codex
related:
  - "/#lark-tickets"
---

# Lark Ticket 详情页前后导航

## 目标

在 Octo 的 Lark Ticket 详情页中，按用户进入详情时已加载、已筛选并排序的列表顺序提供“上一条 / 下一条”。不新增 Meegle 页面、插件注入、Server API 或数据库变更。

## 验收标准

- [x] 从任一 Lark Ticket 列表视图进入详情时，前后切换沿当前已加载排序跨 50 条分页与分组连续进行。
- [x] 不自动加载“加载更多”之外的记录；同步后不存在的记录从导航中跳过。
- [x] 首尾按钮禁用；刷新或直接深链没有列表上下文时不显示前后导航。
- [x] FE 测试、production build 与 diff whitespace 校验通过。

## 方案与决策

列表在用户点击详情链接时只保存内存中的有序 `recordId` 快照。详情页保留现有同步快照读取，并与该有序列表取交集后计算相邻 Ticket，因此不会新增平台或服务端请求，也不会跳转到已被同步移除的记录。分组仅影响列表展示，不打断当前全局排序顺序。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-06 | v1 | done | 列表点击时保存已加载的全局排序 `recordId` 快照；详情页用仍可读取的 Ticket 过滤快照并计算相邻项。已覆盖分组、50 条前端分页、首尾与失效记录的纯逻辑。 | 未执行登录态浏览器视觉验收；需在有筛选结果的本地会话中确认交互样式与真实数据顺序。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 导航逻辑定向测试 | 通过 | `pnpm --dir fe exec node --test src/lib/lark-ticket-detail-navigation.test.js src/lib/lark-ticket-view-config.test.js`，8/8 通过。 | 覆盖中间项、首尾、当前项缺失、同步失效项、排序快照。 |
| FE 全量测试 | 通过 | `pnpm --dir fe test`，184/184 通过。 | 不等同于登录态浏览器验收。 |
| FE production build | 通过 | `pnpm --dir fe build`；Vite 8.2.0 成功构建。 | 不含运行中页面交互证明。 |
| 差异空白校验 | 通过 | `git diff --check`。 | 仅静态差异检查。 |
