---
title: "同步列表视图配置：看板、子分组与空分组"
module: "platform-sync"
status: completed
created_on: 2026-08-27
updated_on: 2026-08-27
closed_on: 2026-08-27
owner: Codex
related:
  - "TEN-49"
---

# 同步列表视图配置：看板、子分组与空分组

## 目标

让 Lark Ticket 与 Meegle 工作项同步列表支持列表/看板切换、主分组、子分组、排序和显示空分组；保留既有可见字段配置。

## 验收标准

- [x] 视图配置可在列表与看板间切换。
- [x] 可配置主分组和不同字段的子分组。
- [x] 列表子分组与看板泳道可分别折叠，且主分组、子分组背景层级明确。
- [x] 排序仍可配置字段和方向。
- [x] 开启后保留当前同步数据中已知但经筛选后为空的分组。
- [x] FE 单测和构建通过。
- [x] Lark Ticket 服务端支持创建时间、`sourceUpdatedAt` 和类型筛选。
- [x] Server 单测和构建通过。
- [x] 工具栏右侧的更新时间与 Meegle Sprint 筛选收进 Filter 弹层；左侧快捷筛选保留在工具栏。
- [x] Filter 使用字段/值双列，字段和值均可搜索；同一字段支持多选。
- [x] FE 测试和构建通过。
- [x] Lark Ticket 与 Meegle 工作项显示带数量的右侧标签筛选栏，并支持指定字段的多选筛选。
- [x] Meegle `priority` 已进入同步快照与 Web 列表投影。
- [x] 平台列表 API 返回真实分页信息，列表/看板按需“加载更多”。

## 背景与范围

截图作为视图配置 UI 参考。视图配置仍是独立 FE 的页面内状态；Lark Ticket 列表的时间与类型筛选下推到 server 的同步快照查询，不涉及平台写操作。右侧的更新时间与 Meegle Sprint 筛选合并到 Filter 弹层，左侧的类型、No Sprint 与各平台快捷筛选保持在工具栏。Filter 的主字段列默认单列呈现；悬停、聚焦或点击字段时，值列作为左侧悬浮菜单显示。状态、更新时间和 Sprint 的值支持多选；全局全文搜索不放在该菜单中，值列单独滚动。

## 方案与决策

分组函数接收当前筛选结果和完整同步数据：前者决定组内卡片，后者提供“空分组”的已知值集合。列表中的主分组和子分组各自可折叠，子分组 key 保持主分组作用域；看板按主分组显示列，并将同一子分组汇总为横跨各列的泳道，可独立折叠。新配置的子分组默认折叠，已保存的手动展开状态保留。

Lark Ticket API 接受 `createdAfter`、`createdBefore`、`sourceUpdatedAtAfter`、`sourceUpdatedAtBefore` 和可重复或逗号分隔的 `issueType`；时间会规范化为 UTC ISO-8601，再于 PostgreSQL 查询、排序和 `limit` 前过滤。

筛选结果集由 Server 决定，Web API 返回 `pager`（offset、limit、total、hasMore、nextOffset）。平台列表首屏只请求一页；用户点击内容区底部的“加载更多”后才请求 `nextOffset`。这样不会根据“本页刚好 500 条”猜测下一页，也避免同一分组被传统页码 UI 割裂。FE 仍在已加载集合上完成排序、List/Kanban 分组、折叠与组数量计算；分组配置修改保持纯前端交互。Lark Ticket 下推状态、更新时间、Issue 类型、紧急度、负责人及快捷条件；Meegle 下推状态、更新时间、Sprint、项目、优先级、类型和无 Sprint 条件。

右侧标签筛选栏在同一字段内按“任一标签”匹配、跨字段按“同时满足”匹配，并显示当前快捷筛选后的每个标签数量。Meegle 的 priority 仅使用平台返回的标准 `priority` 字段；已有快照会在下一次 Meegle 同步后获得该值。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-27 | completed | 已实现配置模型、列表/看板渲染；54 项 FE 单测和 Vite 生产构建通过。 | 未做登录态下的人工浏览器验收。 |
| 2026-08-27 | completed | 已新增 Lark Ticket 服务端创建时间、sourceUpdatedAt、类型筛选及 PostgreSQL 索引；完整 server 测试和 TypeScript 构建通过。 | FE 尚未把现有控件改为向服务端传递筛选参数。 |
| 2026-08-27 | completed | 已将搜索、状态、更新时间及 Meegle Sprint 放入 Filter 弹层；左侧类型、No Sprint 与各平台快捷筛选保留在工具栏。此前 54 项 FE 单测和构建通过，待本次调整复验。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | Filter 已改为字段/值双列，并分别提供字段和值搜索；状态、更新时间和 Meegle Sprint 可多选。`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | 列表子分组已增加独立折叠；看板子分组改为可折叠的跨列泳道。主分组使用品牌浅色背景，子分组/泳道使用中性浅色背景；`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | 移除了 Filter 内不必要的全局全文搜索；字段和值各自搜索，副列值列表可独立滚动；`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | 看板主列与泳道 cell 的最小宽度由 270px 收窄为 220px，保留横向滚动；`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | Filter 字段列改为内容高度的紧凑行（最小 32px、顶部对齐），避免少量字段被拉伸为大卡片；`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | 新配置下 List 子分组和 Kanban 泳道默认折叠；已保存的用户展开状态保持不变；`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | Filter 值列改为按字段悬停/聚焦/点击触发的左侧悬浮菜单，默认隐藏；移动端在主菜单下方展开；`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | Kanban 卡片、主列与泳道标题允许自然换行，适配收窄的列宽；`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | subgroup 泳道的网格列由无上限的 `minmax(220px, 1fr)` 改为 `minmax(220px, 260px)`，避免宽屏下 cell 被拉宽；`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | List 的分组/子分组，以及 Kanban 的主列/子分组泳道标题均显示明确的 `X 条` 数量；`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | Ticket 与 Meegle Kanban 卡片标题统一为普通正文规格（13px、常规字重）；`pnpm --dir fe check` 通过 56/56 测试和 Vite 构建。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | 增加右侧标签筛选栏：Meegle 支持 Sprint、项目、优先级，Lark Ticket 支持 Issue 类型、紧急度、负责人；标签带数量、支持多选，并提供高亮的侧栏开关图标。Meegle priority 已从标准平台字段透传至快照/API；FE 57/57、Server 定向 31/31 测试及 Server 构建通过。 | 已有 Meegle 快照需下一次同步才会填充 priority；未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | 标签侧栏关闭时取消 280px 的预留列，列表/看板恢复完整内容宽度；开启时才使用双列布局。 | 未做登录态浏览器视觉验收。 |
| 2026-08-27 | completed | 筛选改为 Server 先筛选结果集、API 以 500 条分页、FE 自动拉取全部匹配页；List/Kanban 的排序、分组、折叠和数量仍由 FE 基于完整匹配集合处理。Lark 与 Meegle 的现有筛选控件均已下推。 | `show empty groups` 仍基于当前匹配集合的已知值；未连接真实已登录数据做视觉和大数据量验收。 |
| 2026-08-27 | completed | 保留 React StrictMode，并在 Web profile 与平台列表 API 层合并相同的并发请求；开发模式的重复挂载不再让 Lark 分页、Meegle/GitHub 列表或 profile 对 Server 发起两次请求。 | 未在真实浏览器 Network 面板复验。 |
| 2026-08-27 | completed | 平台列表接口新增真实 `pager`，PostgreSQL 用同筛选条件返回 total；List/Kanban 首屏仅请求 500 条，在内容底部显示“已加载 X / Y”与“加载更多”，点击后才请求下一页。旧 Server 缺少 pager 时 FE 按单页结束，避免 offset 无限累加。 | 需将 Server 与 FE 部署到正式环境后，在真实 Network 面板验证首屏仅一条平台数据请求、点击后才出现 `offset=500`。 |
| 2026-08-27 | completed | `#sync` 改为只读取同步状态接口；Server 从各平台快照表汇总每个 source 的最近 `synced_at`，FE 不再加载 Lark/Meegle/GitHub 列表后自行汇总。 | 需在真实 Network 面板确认进入 `#sync` 时只有 `/web/platform-sync-sources` 请求。 |
| 2026-08-27 | completed | 移除 `#sync` 的 10 秒状态轮询，增加“刷新状态”手动按钮；单源“立即同步”完成后仍刷新一次状态。 | 未做登录态浏览器交互验收。 |
| 2026-08-27 | completed | Quick Filter 保持为后端查询参数；当后端筛选结果为 0 时，筛选工具栏仍显示，用户可再次点击已激活的 Quick Filter 取消筛选。 | 未做真实数据下的筛选组合浏览器验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单元测试 / FE 构建 | 通过 | `pnpm --dir fe check`：54/54 tests passed，Vite build passed。 | 未连接真实已登录 FE 数据。 |
| Server 单元测试 / 构建 | 通过 | `pnpm --dir server test`：522/522 passed；`pnpm --dir server build` 通过。 | 未在生产 PostgreSQL 快照上做查询计划验证。 |
| FE 单元测试 / 构建 | 通过 | `pnpm --dir fe check`：54/54 passed，Vite build passed。 | 未连接真实已登录 FE 数据。 |
| FE 单元测试 / 构建 | 通过 | `pnpm --dir fe check`：56/56 passed，Vite build passed。 | 未连接真实已登录 FE 数据或做浏览器视觉验收。 |
| FE 单元测试 / 构建 | 通过 | `pnpm --dir fe check`：56/56 passed，Vite build passed。 | 未连接真实已登录 FE 数据或做浏览器视觉验收。 |
| 标签侧栏与 Meegle priority 投影 | 通过 | `pnpm --dir fe check`：57/57 passed，Vite build passed；`pnpm --dir server test`：522/522 passed；`pnpm --dir server build` 通过。 | 未连接真实已登录 FE 数据；已有 Meegle priority 需同步后验证。 |
| 服务端结果集筛选与 FE 全量分页 | 通过（定向） | `pnpm --dir server exec vitest run src/modules/platform-data/platform-data.controller.test.ts src/application/services/platform-data.service.test.ts src/adapters/postgres/platform-sync-store.test.ts`：20/20 passed；`pnpm --dir fe check`：58/58 passed；两端构建通过。 | 完整 Server suite 有 553 个测试通过；`src/index.test.ts` 仍因当前 SSH 数据库隧道未就绪无法加载，非本改动引起。 |
| FE API 重复请求合并 | 通过 | `pnpm --dir fe check`：60/60 passed，包含 profile 与平台列表并发去重测试及 Vite build。 | 未在真实浏览器 Network 面板复验。 |
| Pager 与按需加载 | 通过（定向） | `pnpm --dir fe check`：62/62 passed；分页相关 Server 定向测试 21/21 passed，Server build passed。 | 完整 Server suite 为 556/557；唯一失败为既有 `src/logger.test.ts` 轮转日志文件时序断言，非本改动。 |
| 同步状态汇总 | 通过（定向） | `pnpm --dir server exec vitest run src/adapters/postgres/platform-sync-status-store.test.ts src/modules/platform-sync/web-platform-sync.controller.test.ts`：11/11 passed；`pnpm --dir server build` 和 `pnpm --dir fe check` 通过。 | 未做已登录浏览器 Network 面板验收。 |
| 同步时间快照来源修正 | 通过（定向） | 状态 Store 测试覆盖“存在旧快照、最新 run 失败”仍返回 `lastSyncedAt`；Server 11/11、FE 62/62 与两端构建通过。 | 未连接正式环境数据库核对各 source 当前快照数量。 |
| 手动刷新同步状态 | 通过 | `pnpm --dir fe check`：62/62 passed，Vite build passed；源码确认 `SyncStatusPage` 无 `setInterval`。 | 未做已登录浏览器交互验收。 |
| 空结果 Quick Filter 可恢复 | 通过 | `pnpm --dir fe check`：62/62 passed，Vite build passed；现有 API 测试覆盖 `quickFilter` 参数序列化。 | 未做已登录浏览器 Network 面板验收。 |

## 关联

- `fe/src/pages/PlatformListPage.jsx`
- `fe/src/lib/lark-ticket-view-config.js`
- `fe/src/lib/meegle-view-config.js`
- `fe/src/lib/platform-list-filters.js`
