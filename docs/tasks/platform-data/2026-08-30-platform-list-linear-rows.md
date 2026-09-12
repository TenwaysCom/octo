---
title: "Platform list linear rows"
module: "platform-data"
status: done
requirement_version: 2
created_on: 2026-08-30
updated_on: 2026-08-30
closed_on: 2026-08-30
owner: "Codex"
related:
  - "Lark Tickets / Meegle Workitems / GitHub Pull Requests"
---

# Platform list linear rows

## 目标

将三类平台同步列表的 table 呈现替换为紧凑单列行，而不是卡片网格：左侧显示类型、紧急度、状态、ID 与标题；右侧显示关联 PR、标签、负责人和日期。PR 或标签过多时保留所有数据并通过 `+N` 弹层访问。

## 验收标准

- [x] Lark Tickets、Meegle Workitems、GitHub Pull Requests 使用共享的单行渲染路径，不使用 table。
- [x] 左右信息布局符合需求；溢出关联项可通过键盘访问的 `+N` 弹层完整查看。
- [x] 既有筛选、分组、分页、排序、详情链接与 GitHub 预览保持可用。
- [x] FE 全量测试和生产构建通过。

## 背景与范围

本次仅改变 `PlatformListPage` 的列表视图。看板视图、后端契约、同步及 Sprint 专有界面不在范围内。需求澄清后明确禁止卡片列表。

## 方案与决策

- v1 是截图启发的线性列表方向。
- v2 明确为连续单行信息流，不使用卡片；右侧集合默认内联 3 项，其余以 `+N` 弹层显示。
- 将平台字段映射抽到纯函数 `platform-list-rows.js`，以当前可见字段配置控制展示，避免在页面组件中重复三种投影逻辑。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-30 | v2 | verified | `PlatformListPage` 接入共享单行渲染，新增纯函数测试；`pnpm test` 101/101 通过，`pnpm build` 通过。 | 未进行已登录浏览器视觉回归或真实溢出弹层操作。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单测 | 通过 | `pnpm --dir fe exec node --test src/lib/platform-list-rows.test.js`：8/8 | 纯投影与溢出拆分，不覆盖 DOM 交互。 |
| FE 全量测试 | 通过 | `cd fe && pnpm test`：101/101 | 未连接真实平台数据。 |
| 生产构建 | 通过 | `cd fe && pnpm build` | 静态构建，不代表登录态 UI 观察。 |
| 浏览器视觉验证 | 未执行 | - | 需要可用的登录态和真实包含多 PR/标签的数据。 |

## 关联

- `fe/src/pages/PlatformListPage.jsx`
- `fe/src/lib/platform-list-rows.js`
- `fe/src/styles/global.css`
