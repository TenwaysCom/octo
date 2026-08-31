---
title: "在 Meegle 列表显示当前工作时长"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-08-31
updated_on: 2026-08-31
closed_on: 2026-08-31
owner: TBD
related:
  - "docs/tasks/platform-data/2026-08-31-show-meegle-workitem-system.md"
  - "docs/tasks/platform-data/2026-08-31-remember-meegle-sprint-detail-view.md"
---

# 在 Meegle 列表显示当前工作时长

## 目标

在 `#meegle-workitems` 和 `#meegle-sprints/<sid>` 的工作项列表显示可配置的“当前工作时长”，复用现有生命周期投影，不修改 Server 存储或 Meegle 同步协议。

## 验收标准

- [x] FE 接收 Server 已返回的 `currentNodeStartTime`。
- [x] 普通 Meegle 列表和 Sprint 详情默认显示“当前工作时长”列，并允许在视图配置中隐藏。
- [x] 进行中工作项从 `currentNodeStartTime` 计算到当前时间，完成项截止到 `itemFinishTime`，页面每分钟刷新。
- [x] 不回退到 `addToCycleTime` 或更新时间；缺失、非法、倒序时间显示空值。
- [x] 已移出 Sprint 的历史成员不使用当前快照的节点开始时间计算历史时长。
- [x] FE 全量测试和 production build 通过。

## 背景与范围

Server DTO、普通工作项查询和 Sprint membership 查询已经投影 `currentNodeStartTime`，但 FE 的 Meegle 响应解析白名单遗漏了它。`addToCycleTime` 表示进入当前 Cycle/Sprint 的兼容快照时间，不能代表当前节点开始；`updatedAt` 也不是生命周期事实。

## 方案与决策

由 FE 共享纯函数计算派生时长，不新增 `current_working_time` 持久化字段。起点固定为 `currentNodeStartTime`；已完成工作项以 `itemFinishTime` 为终点，其他工作项以页面分钟时钟为终点。展示按天、小时、分钟压缩。Sprint 已关闭的 membership 可能携带工作项当前快照的 `currentNodeStartTime`，因此显式不展示，避免污染历史语义。本次不增加动态时长的筛选、分组或排序。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-31 | v1 | in_progress | 字段解析、共享计算函数、两个页面的默认列和分钟刷新已完成；5 个定向测试文件通过，Vite build 通过。 | 运行 FE 全量 check 并审查最终 diff。 |
| 2026-08-31 | v1 | done | `pnpm --dir fe check` 全部通过；27/27 个测试文件通过，production build 成功。 | 未部署，未执行登录态浏览器视觉验证。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 定向测试 | 通过 | 5 个定向测试文件通过；覆盖当前时间、完成时间、无 Cycle fallback、历史 membership、非法时间和列表行。 | 未直接挂载 React 页面。 |
| FE production build | 通过 | `pnpm --dir fe build`：Vite 成功处理 58 个模块。 | 未部署，未执行登录态浏览器视觉验证。 |
| FE 全量 check | 通过 | `pnpm --dir fe check`：27/27 个测试文件通过；Vite 处理 58 个模块并成功输出 production assets。 | 未部署，未执行登录态浏览器视觉验证。 |

## 关联

- `fe/src/lib/meegle-current-working-time.js`
- `fe/src/services/platform-data/platform-data-api.js`
- `fe/src/pages/PlatformListPage.jsx`
- `fe/src/pages/MeegleSprintPages.jsx`
- `docs/ai-dev/lifecycle/current-system-technical-objects.md`
