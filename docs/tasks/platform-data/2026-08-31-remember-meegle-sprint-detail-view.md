---
title: "记住 Meegle Sprint 详情视图选项"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-08-31
updated_on: 2026-08-31
closed_on: 2026-08-31
owner: TBD
related:
  - "docs/tasks/platform-data/2026-08-31-show-meegle-workitem-system.md"
---

# 记住 Meegle Sprint 详情视图选项

## 目标

在当前 Web 会话内，按 `#meegle-sprints/<sid>` 分别记住上次选择的工作项过滤条件和视图配置；离开某个 Sprint 详情再返回时恢复，不写入 Server、数据库或浏览器长期存储。

## 验收标准

- [x] 按 Sprint route ref 分别保存过滤选项，不让 Sprint A 的过滤影响 Sprint B。
- [x] 恢复分组、次分组、排序和显示字段。
- [x] 对恢复值做白名单和类型归一化，忽略未知字段与非法值。
- [x] 刷新浏览器后回到默认状态，符合当前 Web 会话边界。
- [x] FE 测试和 production build 通过。

## 背景与范围

普通 Platform List 已由 `App` 在当前挂载会话中保存页面状态；Sprint 详情此前在每次路由挂载时重新初始化过滤和视图配置。Sprint detail route 使用稳定 Sprint ID 时可作为状态 key，并兼容旧名称路由。

## 方案与决策

由 `App` 持有 `meegleSprintDetailStates`，以路由中的 Sprint ref 为 key。详情页初始化时通过纯函数恢复并归一化 `selectedWorkitemFilters`、`groupBy`、`subGroupBy`、`sort` 和 `visibleColumns`；组件卸载时把最后状态回传。过滤/视图菜单是否打开、详情侧栏与分组折叠状态不属于本次记忆范围。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-31 | v1 | in_progress | 已完成状态归一化、App 按 Sprint ref 保存和详情页卸载回传。 | 补充测试并运行 FE check。 |
| 2026-08-31 | v1 | done | Sprint A/B 状态隔离测试已补充；FE check 全部通过。 | 未执行登录态浏览器导航验证。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 测试 | 通过 | `pnpm --dir fe check`：26/26 个测试文件通过；覆盖恢复值白名单和 Sprint A/B 状态隔离。 | Node 单测未直接挂载 React 页面。 |
| FE production build | 通过 | `pnpm --dir fe check`：Vite 处理 56 个模块并成功输出 production assets。 | 未部署，未执行登录态浏览器导航验证。 |

## 关联

- `fe/src/app/App.jsx`
- `fe/src/pages/MeegleSprintPages.jsx`
- `fe/src/lib/meegle-sprint-workitem-view.js`
