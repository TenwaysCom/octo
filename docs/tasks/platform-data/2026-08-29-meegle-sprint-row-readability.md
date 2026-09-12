---
title: "Meegle Sprint 历史行可读性优化"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-08-29
updated_on: 2026-08-29
closed_on: 2026-08-29
owner: Kimi
related:
  - "docs/tasks/platform-data/2026-08-27-meegle-sprint-ui.md"
---

# Meegle Sprint 历史行可读性优化

## 目标

针对 Sprint 历史页的三项纯展示优化：历史行日期改为短起止区间（MM/DD–MM/DD）并保留完整日期可访问提示；历史行完成率增加紧凑行内进度条；进度图语义改为 Completed 实线、Scope 虚线并同步图例。不新增生命周期筛选、整行跳转、路由、API、业务逻辑、依赖或暗黑模式。

## 验收标准

- [x] 历史行日期列显示 `MM/DD–MM/DD` 短区间，完整起止日期通过 `title` 与 visually-hidden 文本提供。
- [x] 完成率指标单元格内新增紧凑进度条（`role="progressbar"`，带 aria 取值），原有百分比/已完成/Scope 指标与展开行为不变。
- [x] 进度图 Completed 为实线、Scope 为虚线，图例色样改为线型样本并同步实/虚语义。
- [x] Sprint 时间轴、默认展开 Current、详情筛选分组与数据语义保持不变。

## 背景与范围

只修改 `fe/src/pages/MeegleSprintPages.jsx` 的 `SprintHistoryList` 与局部辅助函数，以及 `fe/src/styles/global.css` 中 sprint 相关选择器。数据仍来自既有 `buildMeegleSprintHistory` 投影（`startAt`/`endAt` 始终存在，缺失时回退 `latestActivityAt`）。

## 方案与决策

短日期用本地时区 `MM/DD` 拼接，完整日期复用 `formatDateTime`；进度条为纯 CSS 填充，百分比钳制在 0–100；图例样本由方块改为 14px 线型（Scope 虚线、Started/Completed 实线），与 SVG stroke 语义一致。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-29 | v1 | done | 三项 UI 修改完成；`git diff --stat` 仅含 `MeegleSprintPages.jsx` 与 `global.css`。 | 会话 hook 拦截了 pnpm/npx/node/vitest/vite 等命令，FE 单测与 production build 未能在本会话执行；需人工运行 `pnpm --dir fe test` 与 `pnpm --dir fe build`。未执行登录态浏览器视觉验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测 / 构建 | 未执行 | 执行环境 rescue hook 拒绝 `pnpm --dir fe test|build`、`vitest`、`vite`、`npx`、`node` 等命令。 | 改动为 JSX 展示与 CSS，未触及被单测覆盖的纯函数。 |
| 外部资源 | 未使用 | 本次只修改 FE 展示层与任务文档。 | 没有 PostgreSQL 或 Meegle 运行时证据。 |

## 关联

- `fe/src/pages/MeegleSprintPages.jsx`
- `fe/src/styles/global.css`
- `fe/src/lib/meegle-sprint-history.js`
- `docs/tasks/platform-data/2026-08-27-meegle-sprint-ui.md`
