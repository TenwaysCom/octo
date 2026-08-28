---
title: "Meegle Sprint 历史与详情 UI"
module: "platform-data"
status: completed
requirement_version: 1
created_on: 2026-08-27
updated_on: 2026-08-27
closed_on: 2026-08-27
owner: Codex
related:
  - "TEN-57"
  - "docs/tasks/platform-data/2026-08-27-meegle-sprint-history.md"
---

# Meegle Sprint 历史与详情 UI

## 目标

在 Octo FE 的 Meegle Sprint 历史列表补齐与其他数据列表一致的 Filter 和 Group 图标及交互。该任务只处理页面内筛选、分组和展示状态，不改变 Sprint 数据同步、生命周期清洗或归属历史规则。

## 验收标准

- [x] Sprint 历史页展示与其他列表一致的 Group、Filter 图标和弹层。
- [x] Filter 可多选 `Current`、`Upcoming`、`Past`、`日期未同步`，显示各生命周期数量，并支持清空和空结果提示。
- [x] 同一生命周期字段内按 OR 匹配；未选择任何值时显示全部 Sprint。
- [x] Group 默认保持按日期倒序的时间线，可切换为按生命周期分组。
- [x] 生命周期分组按 Current、Upcoming、Past、日期未同步排序，且不展示空组。
- [x] Filter / Group 弹层互斥并支持 Escape 关闭。
- [x] 默认仍展开筛选结果中的 Current Sprint；原有 Sprint 图表和详情页右侧 panel 行为保持不变。
- [x] FE 单元测试和 production build 通过。

## 背景与范围

Sprint 历史与详情页面已经存在，但历史列表缺少其他数据列表已有的 Filter 和 Group 入口。本任务复用现有列表按钮图标、弹层视觉样式和键盘关闭行为；筛选和分组均是 FE 页面内状态，不新增 Server 查询参数，不访问 PostgreSQL 或 Meegle。

## 方案与决策

Filter 只针对 Sprint 的日期生命周期分类；Group 提供时间线和生命周期两种视图。筛选、分组逻辑放在 `meegle-sprint-history.js` 的纯函数中，页面组件只维护选择状态和渲染结果，以便单元测试覆盖。该 UI 任务与 Sprint 生命周期数据/历史归属任务分别记录，后者继续由 `2026-08-27-meegle-sprint-history.md` 管理。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-27 | v1 | completed | Sprint 历史列表补齐 Group / Filter 图标；支持生命周期多选筛选以及时间线/生命周期分组，保留默认展开 Current Sprint 和详情 panel 行为。 | 未执行登录态浏览器视觉验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测 / 构建 | 通过 | `pnpm --dir fe check`：75/75 tests passed；Vite production build passed。新增测试覆盖 Sprint 生命周期多选筛选、默认时间线和稳定生命周期分组。 | 未执行登录态浏览器视觉验收。 |
| 外部资源 | 未使用 | 本次只修改 FE、纯函数测试和任务文档。 | 没有 PostgreSQL 或 Meegle 运行时证据。 |

## 关联

- `fe/src/pages/MeegleSprintPages.jsx`
- `fe/src/lib/meegle-sprint-history.js`
- `fe/src/lib/meegle-sprint-history.test.js`
- `fe/src/styles/global.css`
- `docs/tasks/platform-data/2026-08-27-meegle-sprint-history.md`
