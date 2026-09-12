---
title: "Lark Ticket 详情页前后导航"
module: "platform-data"
status: done
requirement_version: 3
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
- [x] 不自动加载“加载更多”之外的记录；前后切换直接使用进入详情时的列表数据，不重拉完整列表。
- [x] 首尾按钮禁用；刷新或直接深链没有列表上下文时不显示前后导航。
- [x] FE 测试、production build 与 diff whitespace 校验通过。

## 方案与决策

列表在用户点击详情链接时保存内存中的有序 Ticket 快照。前后切换直接从该快照读取详情和相邻 Ticket，不重拉完整同步列表；分组仅影响列表展示，不打断当前全局排序顺序。直接深链仍使用既有同步列表读取作为兜底。进入详情后发生的同步变更会在用户返回或刷新列表、取得新快照后反映。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-06 | v1 | done | 列表点击时保存已加载的全局排序 `recordId` 快照；详情页用仍可读取的 Ticket 过滤快照并计算相邻项。已覆盖分组、50 条前端分页、首尾与失效记录的纯逻辑。 | 未执行登录态浏览器视觉验收；需在有筛选结果的本地会话中确认交互样式与真实数据顺序。 |
| 2026-09-06 | v2 | done | 移除详情顶部、前后导航旁的“在 Lark 中查看”入口；Resources 区的 Lark 外链保留。 | 未执行登录态浏览器视觉验收。 |
| 2026-09-06 | v3 | done | 导航上下文保存原列表 Ticket 数据；前后切换直接复用，不再请求完整 Lark Ticket 列表。 | 会话内不会检测详情进入后发生的同步删除；刷新或返回列表后才会取得新快照。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 导航逻辑定向测试 | 通过 | `pnpm --dir fe exec node --test src/lib/lark-ticket-detail-navigation.test.js src/lib/lark-ticket-view-config.test.js`，8/8 通过。 | 覆盖中间项、首尾、当前项缺失、排序快照与复用的 Ticket 数据。 |
| FE 全量测试 | 通过 | `pnpm --dir fe test`，v1 与 v3 均为 184/184 通过。 | 不等同于登录态浏览器验收。 |
| FE production build | 通过 | `pnpm --dir fe build`；v1、v2、v3 均由 Vite 8.2.0 成功构建。 | 不含运行中页面交互证明。 |
| 差异空白校验 | 通过 | v1、v2、v3 均执行 `git diff --check`。 | 仅静态差异检查。 |
