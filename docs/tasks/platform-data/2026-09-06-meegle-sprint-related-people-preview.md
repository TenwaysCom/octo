---
title: "Meegle Sprint 详情相关人首项预览"
module: "platform-data"
status: done
created_on: 2026-09-06
updated_on: 2026-09-06
owner: TBD
---

# Meegle Sprint 详情相关人首项预览

## 目标

让 Meegle Sprint 详情页工作项的“当前相关人”默认只显示第一个，其余显示为 `+N`。

## 验收标准

- [x] Sprint 详情页的相关人列仅内联显示第一位相关人。
- [x] 多出的相关人显示为 `+N`，可继续通过现有弹层查看完整角色和成员。
- [x] 普通 Meegle 工作项列表仍默认内联显示两位相关人。
- [x] 相关人纯函数测试和 FE 构建通过。

## 范围与决策

- 只在 `MeegleSprintPages` 的相关人列传入内联上限 1；不改变数据投影、筛选或通用组件默认值。
- 延续现有 `aria-label`、键盘 Escape、失焦关闭及固定定位弹层行为，完整相关人不被截断或丢弃。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-09-06 | done | 通用组件保留默认上限 2；Sprint 详情相关人列显式传入上限 1，多余成员通过已有 `+N` 弹层保留完整角色和成员。 | 未进行登录态浏览器验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 相关人纯函数测试 | 通过 | `pnpm --dir fe exec node --test src/lib/meegle-related-people.test.js`：3/3。 | 不渲染浏览器弹层。 |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：187/187。 | 不调用真实平台。 |
| FE 构建 | 通过 | `pnpm --dir fe build`。 | 未执行登录态浏览器验收。 |
