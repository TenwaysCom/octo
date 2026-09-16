---
title: "Meegle Sprint 图表与图标视觉优化"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-09-05
updated_on: 2026-09-05
closed_on: 2026-09-05
owner: Codex
related:
  - "/#meegle-sprints"
  - "2026-08-27-meegle-sprint-ui.md"
---

# Meegle Sprint 图表与图标视觉优化

## 目标

提升 Meegle Sprint 历史和详情页的趋势图可读性与页面内图标一致性；不改变统计口径、数据读取或 AI Session 行为。

## 验收标准

- [x] Scope、Started、Completed 走势使用平滑且不超调的曲线，保留各日期统计值。
- [x] 图例、终点标记和低对比度网格使三条趋势线更易辨认。
- [x] Sprint AI 操作、会话卡片、关闭和发送控件使用一致的 SVG 图标。
- [x] FE 测试和 production build 通过。

## 背景与范围

当前趋势图使用水平/垂直的阶梯路径，视觉上不适合展示逐日趋势；Sprint AI 区域混用多个文字符号。本次只调整 FE 呈现，不改变 API、数据模型或交互文案。

## 方案与决策

以单调三次贝塞尔曲线连接相邻日期。转折点斜率使用相邻斜率的调和平均，方向反转时归零，避免平滑曲线越过实际数据范围。图表只对 Completed 增加弱面积层，三条线继续使用原有颜色语义。页面内的 AI 相关文字图标由同文件的内联 SVG 组件替换，不新增图标依赖或资产。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-05 | v1 | done | 图表已改为单调平滑曲线，并统一 Sprint AI 区域图标；`pnpm --dir fe test` 与 `pnpm --dir fe build` 通过。 | 未执行登录态浏览器视觉验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：33/33 个测试文件通过。 | Node 单测不覆盖浏览器视觉。 |
| FE production build | 通过 | `pnpm --dir fe build`：Vite 成功生成 65 个模块。 | 未部署或重启 FE 服务。 |

## 关联

- `fe/src/pages/MeegleSprintPages.jsx`
- `fe/src/styles/global.css`
- `docs/tasks/platform-data/2026-08-27-meegle-sprint-ui.md`
