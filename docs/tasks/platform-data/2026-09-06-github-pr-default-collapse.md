---
title: "GitHub PR 列表分组默认折叠"
module: "platform-data"
status: done
created_on: 2026-09-06
updated_on: 2026-09-06
owner: TBD
---

# GitHub PR 列表分组默认折叠

## 目标

让 GitHub PR 列表的一级分组默认全部收起。

## 验收标准

- [x] 首次进入按状态等方式分组的 GitHub PR 列表时，一级分组全部收起。
- [x] 修改一级或子分组配置时，一级分组重新默认收起。
- [x] 已保存的手工展开/收起状态，以及筛选、排序、刷新后的状态保持不变。
- [x] GitHub PR 视图配置单元测试和 FE 构建通过。

## 范围与决策

- 仅改 Web GitHub PR 列表的一级分组初始化；不改数据请求、筛选、排序或其他平台列表。
- 延续 Lark Ticket 与 Meegle 的规则：仅首次初始化或分组配置变化时设默认值，不在数据刷新时覆盖用户手动状态。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-09-06 | done | GitHub PR 一级分组采用与 Lark Ticket、Meegle 相同的按配置初始化模式：首次载入或变更一级/子分组配置时收起全部一级分组；恢复状态和同一配置的数据刷新不重置手工选择。 | 未进行登录态浏览器验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| GitHub PR 视图配置测试 | 通过 | `pnpm --dir fe exec node --test src/lib/github-pull-request-view-config.test.js`：4/4。 | 纯函数，不含浏览器运行时。 |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：186/186。 | 不调用真实平台。 |
| FE 构建 | 通过 | `pnpm --dir fe build`。 | 未执行登录态浏览器验收。 |
