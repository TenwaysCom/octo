---
title: "Meegle 列表页关联 PR 展示压缩与补加入口"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-09-12
updated_on: 2026-09-12
closed_on: 2026-09-12
owner: jack
related:
  - "fe/src/pages/PlatformListPage.jsx"
  - "fe/src/lib/platform-list-rows.js"
  - "fe/src/components/platform/OdooShBuildStatus.jsx"
---

# Meegle 列表页关联 PR 展示压缩与补加入口

## 目标

Meegle 列表页（`PlatformListPage` 的 `meegle-workitems` 视图，列表行与看板卡片两条渲染路径）关联 PR 区域两处改动：

1. 已关联 PR 少于 3 个时，继续展示"选择关联 PR"入口（此前一旦有关联 PR，入口即消失，无法补加）。
2. 单个 PR 展示过长：`#123-分支` 徽标 + 状态文字胶囊 + 逐环境 build 圆点（含环境文字）。压缩为 `#123-eu` 徽标（环境从 repo 名反推）+ 带颜色圆点表示 PR 状态 + 单个带颜色齿轮表示 build 状态。

不在范围内：GitHub PR 独立列表页、Sprint 页面（`MeegleSprintPages`）的 PR 展示保持原样。

## 验收标准

- [x] 关联 PR 数量 0/1/2 时可见 PR 选择器入口；满 3 个后不再显示。
- [x] PR 状态以彩色圆点表达（open/merged/closed/draft 四色），完整信息在徽标 tooltip。
- [x] build 状态以单个齿轮表达，颜色取最差结果（failed > warning > unknown > success），EU/UK 等各环境明细合并进 tooltip。
- [x] `pnpm --dir fe test` 与 `pnpm --dir fe build` 通过。

## 背景与范围

- 行视图：`buildMeegleWorkitemRow` 产出 `pr-links`/`pr-picker` meta → `WorkitemRowMeta` 渲染；`ROW_OVERFLOW_LIMIT = 3` 同时是行内可见 PR 数与本次"可补加"的阈值。
- 看板视图：`MeegleWorkitemCell` → `GitHubPullRequestLinks` 渲染，选择器经 `onPick` 回调打开 `MeeglePullRequestPicker`（快捷键 g）。
- build 数据两条来源：列表接口预加载的 `pullRequest.odooShBuilds`，以及 `OdooShBuildStatus` 异步拉取（loading/refreshing/stale/unavailable）。

## 方案与决策

- `pr-links` meta 新增 `canAddMore: pullRequests.length < ROW_OVERFLOW_LIMIT`；空列表仍走原 `pr-picker`，行为不变。
- 新增 `GitHubPullRequestStatusDot`（状态圆点）与 `PullRequestSummaryLink`（`#编号-环境` 徽标 + 圆点 + 齿轮），行视图与看板视图共用；分支/repo/标题并入 tooltip。
- 环境名（eu/uk/us）按用户要求内联进 PR 编号徽标：FE 侧新增 `resolveGitHubRepoEnvironment`（`fe/src/lib/odoo-sh-build-status.js`，镜像 server 端 `odoo-devops-environment-mapping` 的 repo→环境映射），不依赖 build 接口返回。
- `OdooShBuildStatus.jsx` 导出 `OdooShBuildGears`（单齿轮汇总组件）并为异步组件加 `compact` prop：加载中/不可用/无构建均渲染灰色齿轮并以 title 说明。
- 原环境文字 + 圆点的 `OdooShBuildDots` 仅保留在 GitHub PR 列表页 branch 列继续使用。
- "相关人"列（`relatedPeople`）按用户要求从 `DEFAULT_MEEGLE_VISIBLE_COLUMNS` 移除，默认不显示；`COLUMN_KEYS` 改从 `MEEGLE_VIEW_COLUMNS` 取，保证手动开启后不被 normalize 掉。已持久化视图配置的用户不受影响。
- 负责人（`assignee`）改用 `User` widget 显示：行视图 meta 从纯文本 `text` 换成既有 `lark-users` 路径（`LarkTicketResponsible`），看板单元格直接渲染 `<User name>`，与 Sprint 页一致。
- System 改用徽标显示：FE 新增 `resolveMeegleSystemEnvironment`，按解析出的环境区分三色（eu 紫 / uk 蓝 / us 青，歧义值回退中性灰）；行视图与看板单元格共用 `MeegleSystemBadge`。首版误镜像了 server 处理原始 MQL label 的同名函数，未识别 API 已归一化的裸值 `eu`/`us`/`uk`，已修复（见 ERR-20260912-001）。
- Sprint 改用徽标显示：`getAutoBadgeTone`（platform-list-rows.js）对值做 djb2 哈希取模 7，在 7 组徽标配色间稳定轮换（同名值颜色恒定，相邻值色相错开；从 10 组收敛到 7 组，去掉互相撞色的宝蓝/浅黄与易误读为未设置的中性灰）。Version 按用户要求复用同一徽标；组件与类名泛化为 `MeegleAutoBadge`/`meegle-auto-badge`，sprint 与 version 共用，行视图与看板单元格一致。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-12 | v1 | done | FE 208 项单测全过，vite build 成功 | 未做浏览器端人工验证 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单测 | 通过 | `pnpm --dir fe test`：208 pass / 0 fail（含新增 `buildMeegleWorkitemRow` canAddMore 断言） | 仅覆盖行模型层，未覆盖 JSX 渲染 |
| 构建 | 通过 | `pnpm --dir fe build`：75 modules，产物正常 | - |
