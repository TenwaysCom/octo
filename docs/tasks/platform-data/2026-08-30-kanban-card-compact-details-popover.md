---
title: "Kanban 卡片紧凑化与可访问详情浮层"
module: "platform-data"
status: done
requirement_version: 3
created_on: 2026-08-30
updated_on: 2026-08-30
closed_on: 2026-08-30
owner: TBD
related:
  - "fe/src/pages/PlatformListPage.jsx"
---

# Kanban 卡片紧凑化与可访问详情浮层

## 目标

以 Linear 风格为方向优化 PlatformListPage 看板卡片：第一行标题与右上角人员 avatar，第二行标识、状态和短日期，第三行将其余已选字段排为可换行的紧凑 metadata；描述保留在可访问的详情浮层。不补后端、不猜测缺失字段，按字段能力优雅降级。

## 验收标准

- [x] 看板列宽为 300–360px，适合标题与三行信息结构
- [x] 第二行按可用字段显示 ID、状态与短日期（`M/D`）
- [x] Meegle 第二行时间优先使用 `itemStartTime`，缺失时回退 `addToCycleTime`，不回退到同步更新时间
- [x] 第三行显示其余已选字段的可换行 metadata，描述以浮层展示
- [x] 右上角人员字段映射：Lark responsible 与 requester；Meegle assignee；GitHub authorLogin
- [x] 字段缺失时不渲染 avatar，不显示无语义字段
- [x] 浮层支持按钮触发、键盘焦点、Escape 关闭并回焦、aria-expanded/aria-controls，且不被看板列/泳道 overflow 裁剪
- [x] avatar 保留完整可访问名称（role="img" + aria-label，GitHub 图片 alt="" 由容器命名）

## 背景与范围

只改 FE：`fe/src/pages/PlatformListPage.jsx`、`fe/src/styles/global.css`、新增 `fe/src/lib/kanban-card-person.js` 及测试。Lark `detailDescription` 与 GitHub `description` 已在列表 payload 中，存在时一并显示于浮层；Meegle 没有可用描述字段，因此不猜测或补后端。

## 方案与决策

- 人员、描述与卡片布局解析抽为纯函数 `getKanbanCardPeople(kind, item)` / `getKanbanCardDescription(kind, item)` / `getKanbanCardLayout(kind, visibleColumns, item)`，便于 node:test 覆盖并保证降级逻辑集中。
- 第三行用 `flex-wrap` 实现视觉上的浮动标签，避免传统 CSS `float` 破坏卡片高度与响应式布局。
- Meegle 业务时间直接使用列表 DTO 已有的 `itemStartTime` / `addToCycleTime`；显示为短日期，完整时间和来源放在 `title` / `aria-label`。
- 浮层用 `position: fixed` + 触发按钮 getBoundingClientRect 定位，绕开 `.kanban-board__column` / `.kanban-swimlane` 的 overflow 裁剪；失焦（blur 出容器）自动关闭，Escape stopPropagation 避免触发页面快捷键。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-30 | v1 | done | `pnpm --dir fe test` 112/112 通过；`pnpm --dir fe build` 通过 | 未做浏览器实机交互验证 |
| 2026-08-30 | v2 | done | 三行布局、300–360px 列宽、短日期与动态 metadata 已落地；`pnpm --dir fe test` 114/114 通过，构建通过 | 未做浏览器实机交互验证 |
| 2026-08-30 | v3 | done | Meegle `itemStartTime` → `addToCycleTime` 时间优先级已落地；定向 15/15、FE 全量 116/116、构建通过 | 未做浏览器实机交互验证 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单测（node --test） | 通过 | `pnpm --dir fe test`：116/116 passed；Kanban 定向测试 15/15 passed | 未覆盖浏览器实机交互 |
| 构建（vite build） | 通过 | `pnpm --dir fe build` | 未覆盖浏览器实机交互 |
| 静态审查 | 通过 | `git diff --check` 通过；JSX/CSS 逐块复核 | 未覆盖浏览器实机交互 |

## 关联

- `.learnings/LEARNINGS.md` LRN-20260830-001
