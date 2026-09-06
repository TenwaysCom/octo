---
title: "Shadow AI 输出与 Ticket 详情展示增强"
module: "ai-ticket"
status: done
requirement_version: 15
created_on: 2026-09-06
updated_on: 2026-09-06
closed_on: 2026-09-06
owner: TBD
related:
  - "lark-ticket-shadow-summary"
---

# Shadow AI 输出与 Ticket 详情展示增强

## 目标

在不修改 Eval 数据集功能的前提下，扩展 Shadow AI 的只读 FE 投影：AI 输出视图将 Shadow 信息合并进现有四阶段模块并通过悬浮层展示详情；Ticket 详情页继续在右侧 Shadow AI 面板展示更多处理结果与质量信息。关键词直接完整显示，长文本最多显示三行并可悬浮查看全文。

## 验收标准

- [x] Eval 数据集的列表、编辑器、接口和交互保持不变。
- [x] Server 安全解析并透出 Shadow 意图、处理结果、质量和证据数量，不返回原始 `shadow_ai` JSON。
- [x] AI 输出视图不增加新模块；Shadow 信息合并进现有四阶段模块，默认展示摘要，悬浮展示相应详情。
- [x] 正式输出继续优先，Shadow 结果不得把正式 Answer 或 Document 阶段错误标记为已生成。
- [x] Ticket 详情右侧 Shadow AI 面板展示处理结果和质量信息；关键词直接完整展示，问题/方案/质量摘要最多显示三行并可悬浮查看全文。
- [x] Shadow `result.confidence` 在详情页及答案阶段详情统一标为“答案置信”，并置于方案摘要之后。
- [x] Ticket 详情页移除“全部 Lark Ticket”返回入口；上一条/下一条移入固定的 workspace-breadcrumbs 栏。
- [x] AI 输出行的标题独占一行，不显示 Ticket 描述和“打开 AI Actions”；正式 AI 与 Shadow 状态合并为单一行级标记，四阶段模块不重复显示 Shadow 标记。
- [x] AI 输出行标题默认最多显示三行；正式答案缺失时，答案模块直接区分 Shadow 的处理结果或运行状态。
- [x] AI 输出行的“查看 prepared messages”入口缩短为“查看messages”。
- [x] Eval 数据集行参考 AI 输出样式：标题最多三行、不显示数据集状态、AI 标记采用正式 AI 优先并回退 Shadow 状态，操作区固定在最右侧。
- [x] Eval 左侧展示 Ticket 类型和状态 badge；AI 意图合并正式 AI 与 Shadow 详情；人工意图和期望结果在阶段卡片内直接展示全文，失败标签维持摘要与悬浮详情。
- [x] Eval 标题前明确展示 Draft、Badcase、Eval 三种数据集状态 badge，其中 Badcase 为红色。
- [x] Eval 行的三个操作收进右侧 `…` 下拉菜单，列表只保留一个操作入口。
- [x] Eval 编辑操作改为常驻图标按钮；`…` 菜单只保留 Thread 和 messages。
- [x] Eval 左侧展示 Issue No，不展示或回退到 Record ID。
- [x] 人工意图和期望结果直接绑定并展示具体文本，不使用数量或摘要值。
- [x] Eval 左侧只展示 Issue 编号值，不显示“Issue No”标签和快照版本。
- [x] Server 与 FE 定向测试、全量测试和构建通过。

## 背景与范围

Shadow Worker 已把完整 `support-analysis-result-v1` 写入独立 `lark_base_ticket_octo.shadow_ai`，但当前公开投影只包含意图、简洁总结和运行元数据。现有 AI 输出视图只在正式意图/总结缺失时使用 Shadow fallback；Ticket 详情右栏也只展示意图、置信度和总结。本次不改变 Worker、Prompt、正式 `ticket_ai` 写回或 Eval 数据集行为。

## 方案与决策

- 扩展 `LarkTicketShadowAi` 的显式白名单投影，新增意图摘要、关键词、证据数量、处理结果、自动化建议、质量摘要及风险数组。
- AI 输出四阶段仍为意图识别、问题总结、Ticket 答案总结、文档生成。前三阶段按各自语义提供 Shadow 悬浮详情；Document 没有 Shadow 产物，因此维持正式字段行为。
- 正式字段仍是默认摘要的第一优先级。正式 Answer 缺失时可以显示 Shadow 方案摘要，但正式状态仍为“未生成”，另用“Shadow 判断”标记说明摘要来源。
- Ticket 详情保留右栏位置；空字段不渲染，关键词直接完整显示；问题、方案和质量摘要最多显示三行并保留全文 `title`。
- v2：AI 输出行标题独占一行，描述和“打开 AI Actions”不渲染；有正式输出时行级状态只显示“AI”，否则回退显示 Shadow 状态或“AI 未输出”；四阶段模块只保留摘要和悬浮详情，不重复展示 Shadow 标记。
- v3：标题改为三行截断；答案模块在正式答案缺失时显示 `Shadow · 已解决/待处理/已升级/失败/已跳过` 等短状态，正式答案存在时仍以正式状态为准；AI 输出行入口改为“查看messages”。
- v4：Eval 数据集行复用三行标题和 AI/Shadow 短标记；列表移除数据集状态列，但编辑弹窗仍保留状态修改；操作区固定在最右列。
- v5：Eval 左侧补充 Ticket 类型、Ticket 状态 badge；AI 意图默认正式结果优先并在悬浮详情中合并 Shadow 意图、置信度、关键词和证据；人工意图、期望结果、失败标签改用 AI 输出阶段卡样式，长内容悬浮查看全文。
- v5 补充：普通草稿/Eval 状态不展示，`Badcase` 作为异常标记以红色 badge 保留在左侧。
- v6：Eval 行右侧将打开 Lark Thread、查看 messages、编辑三个操作合并进 `…` 菜单；AI 输出行操作保持不变。
- v7：编辑从 `…` 菜单移出，以带无障碍文案的铅笔图标常驻展示；菜单缩减为两个次级操作。
- v8：数据集状态重新明确展示并前置到标题之前，使用 Draft、Badcase、Eval 三种 badge；此要求覆盖 v4/v5 的列表隐藏规则。
- v9：人工意图和期望结果在卡片内直接展示全文，不再截断或通过悬浮层查看；覆盖 v5 的对应展示规则。
- v10：Eval 左侧元信息以 Issue No 替换 Record ID；Issue No 缺失时明确显示“未设置”，不泄露内部 Record ID。
- v11：人工意图和期望结果改用专用文本卡，直接渲染样本中的完整字符串，不再经通用摘要卡转换。
- v12：Eval 左侧元信息移除快照版本与“Issue No”标签，只保留 Issue 编号值；快照版本同步移出列表列配置。
- v13：Ticket 详情页 Shadow AI 面板取消关键词与详情的截断；处理步骤和风险也直接显示完整文本，不再只显示数量或依赖悬浮提示。
- v14：`result.confidence` 是结果/答案结论的置信度，统一显示为“答案置信”并置于方案摘要之后；本版本覆盖 v13 的长文本直接完整显示规则，恢复为最多三行并保留全文悬浮提示。
- v15：Ticket 详情移除顶部“全部 Lark Ticket”返回入口；前后导航作为面包屑栏的右侧操作，workspace-breadcrumbs 滚动时固定在视口顶部。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-06 | v1 | in_progress | 已确认 UI 与数据投影范围并建档。 | 实现 Server/FE 投影、展示与测试。 |
| 2026-09-06 | v1 | done | Server 白名单投影、AI 输出四阶段 Shadow 悬浮详情和 Ticket 右栏扩展完成；正式 Answer 状态保持“未生成”，仅以“Shadow 判断”标识分析来源。 | 未做登录态浏览器目检；自动化测试与生产构建已覆盖数据映射和编译边界。 |
| 2026-09-06 | v2 | in_progress | 用户收敛 AI 输出行头：标题独占一行、移除描述、合并正式 AI 与 Shadow 状态、模块内不重复显示 Shadow 标记。 | 调整行头和 Pipeline 标记并回归。 |
| 2026-09-06 | v2 | done | AI 输出行改为标题独占首行，第二行按“正式 AI 优先、否则显示 Shadow 状态”展示单一短标记；移除描述和“打开 AI Actions”，四阶段保留摘要与 Shadow 悬浮详情但不重复显示 Shadow 标记。 | 未做登录态浏览器目检。 |
| 2026-09-06 | v3 | in_progress | AI 输出行标题改为最多三行；答案模块在无正式答案时展示 Shadow 处理/运行状态；消息入口缩短为“查看messages”。 | FE 测试与构建回归。 |
| 2026-09-06 | v3 | done | 标题三行截断、答案 Shadow 短状态和 AI 输出行“查看messages”入口完成；Eval 行入口未改动。 | 未做登录态浏览器目检；定向 `vitest` 命令不适用于 FE，已改用包内 `node --test` 脚本完成回归。 |
| 2026-09-06 | v4 | in_progress | Eval 数据集行对齐 AI 输出的标题和 AI/Shadow 状态样式，移除列表数据集状态并固定右侧操作区。 | FE 测试与构建回归。 |
| 2026-09-06 | v4 | done | Eval 标题改为三行截断；列表隐藏数据集状态；冻结正式 AI 输出优先，否则展示当前 Shadow 状态；消息与编辑动作固定在最右侧。 | 未做登录态浏览器目检。 |
| 2026-09-06 | v5 | in_progress | Eval 左侧增加类型与状态 badge；AI 意图融合 Shadow 详情；标注字段改为可悬浮查看全文的阶段卡。 | FE 测试与构建回归。 |
| 2026-09-06 | v5 | done | Eval 左侧固定展示 Ticket 类型、Ticket 状态及红色 Badcase badge；AI 意图优先冻结正式值并融合当前 Shadow 详情；人工意图、期望结果和失败标签改为阶段卡与悬浮全文。 | 未做登录态浏览器目检。 |
| 2026-09-06 | v6 | in_progress | Eval 三个行操作合并为右侧 `…` 菜单。 | FE 测试与构建回归。 |
| 2026-09-06 | v6 | done | Eval 行右侧只保留 `…`，展开后提供打开 Lark Thread、查看messages和编辑三个选项；执行菜单操作后自动收起。 | 未做登录态浏览器目检。 |
| 2026-09-06 | v7 | done | Eval 编辑以铅笔图标常驻，`…` 菜单只保留 Thread 与 messages。 | 未做登录态浏览器目检。 |
| 2026-09-06 | v8 | done | Draft、Badcase、Eval 三种状态 badge 前置到标题前，Badcase 使用红色。 | 未做登录态浏览器目检。 |
| 2026-09-06 | v9 | done | 人工意图、期望结果在阶段卡片内直接展示完整内容。 | 未做登录态浏览器目检。 |
| 2026-09-06 | v10 | done | Eval 元信息展示 Issue No；缺失时显示“未设置”，不回退显示 Record ID。 | 未做登录态浏览器目检。 |
| 2026-09-06 | v11 | done | 人工意图和期望结果改用专用文本卡，直接显示数据库样本中的完整字符串；空值显示“待标注”。 | 未做登录态浏览器目检。 |
| 2026-09-06 | v12 | done | Eval 左侧仅展示 Issue 编号值，移除快照版本和 Issue No 标签；快照版本不再出现在列配置中。 | 未做登录态浏览器目检。 |
| 2026-09-06 | v13 | done | Ticket 详情页 Shadow AI 面板的关键词、详情、处理步骤和风险改为直接完整显示，移除四行/单行截断及仅悬浮查看的依赖。 | `pnpm --dir fe test`、`pnpm --dir fe build` 与 `git diff --check` 通过；未做登录态浏览器目检。 |
| 2026-09-06 | v14 | done | `result.confidence` 在详情页和答案阶段详情均改为“答案置信”，位于方案摘要之后；关键词完整换行，长文本恢复为三行截断与全文悬浮提示。 | `pnpm --dir fe test`、`pnpm --dir fe build` 与 `git diff --check` 通过；未做登录态浏览器目检。 |
| 2026-09-06 | v15 | done | 已移除 Ticket 详情顶部“全部 Lark Ticket”入口；前后导航移至固定的 workspace-breadcrumbs 右侧。 | `pnpm --dir fe test`、`pnpm --dir fe build` 与 `git diff --check` 通过；未做登录态浏览器目检。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 定向测试 | 通过 | `pnpm --dir server exec vitest run src/domain/lark-ticket-ai.test.ts`（5/5） | 只验证白名单投影，不读取真实数据库。 |
| Server 全量测试 | 通过 | `pnpm --dir server test`（155 files passed / 772 tests passed，另 1 file / 1 test skipped） | 不调用真实 Lark 或模型。 |
| Server 构建 | 通过 | `pnpm --dir server build` | TypeScript 静态边界。 |
| FE 全量测试 | 通过 | `pnpm --dir fe test`（36/36） | 覆盖 Pipeline 来源优先级、Shadow 阶段详情和既有 Eval 模块回归；不替代浏览器视觉验收。 |
| FE 构建 | 通过 | `pnpm --dir fe build` | Vite production build。 |
| Diff 检查 | 通过 | `git diff --check` | 不验证视觉布局。 |
| v2 FE 回归 | 通过 | `pnpm --dir fe test`（36/36）、`pnpm --dir fe build` | 新增合并状态单测；未做登录态浏览器目检。 |
| v3 FE 回归 | 通过 | `pnpm --dir fe test`（36/36）、`pnpm --dir fe build`、`git diff --check` | 覆盖正式答案优先及 Shadow 待处理、失败、跳过状态；未做登录态浏览器目检。 |
| v4 FE 回归 | 通过 | `pnpm --dir fe test`（36/36）、`pnpm --dir fe build`、`git diff --check` | 覆盖 Eval 可见列配置回归和生产编译；未做登录态浏览器目检。 |
| v5 FE 回归 | 通过 | `pnpm --dir fe test`（36/36）、`pnpm --dir fe build`、`git diff --check` | 覆盖 AI/Shadow 映射既有单测与新增 JSX/CSS 的生产编译；未做登录态浏览器目检。 |
| v6 FE 回归 | 通过 | `pnpm --dir fe test`（36/36）、`pnpm --dir fe build`、`git diff --check` | 覆盖菜单 JSX/CSS 的生产编译与既有 FE 回归；未做登录态浏览器目检。 |
| v7-v9 FE 回归 | 通过 | `pnpm --dir fe test`（36/36）、`pnpm --dir fe build`、`git diff --check` | 覆盖最终操作区、状态 badge 和全文卡片的编译边界；未做登录态浏览器目检。 |
| v10 FE 回归 | 通过 | `pnpm --dir fe test`（36/36）、`pnpm --dir fe build`、`git diff --check` | 覆盖 Issue No 映射和 JSX 编译边界；未做登录态浏览器目检。 |
| v11 FE 回归 | 通过 | `pnpm --dir fe test`（36/36）、`pnpm --dir fe build`、`git diff --check` | 覆盖直接文本渲染的 JSX/CSS 编译边界；未做登录态浏览器目检。 |
| v12 FE 回归 | 通过 | `pnpm --dir fe test`（36/36）、`pnpm --dir fe build`、`git diff --check` | 覆盖快照列配置清理和 Issue 编号 JSX 编译边界；未做登录态浏览器目检。 |
| v13 FE 回归 | 通过 | `pnpm --dir fe test`（184/184）、`pnpm --dir fe build`、`git diff --check` | 覆盖现有 FE 行为与生产编译；未做登录态浏览器目检。 |
| v14 FE 回归 | 通过 | `pnpm --dir fe test`（184/184）、`pnpm --dir fe build`、`git diff --check` | 覆盖答案置信标签/顺序、现有 FE 行为与生产编译；未做登录态浏览器目检。 |
| v15 FE 回归 | 通过 | `pnpm --dir fe test`（184/184）、`pnpm --dir fe build`、`git diff --check` | 覆盖面包屑操作槽、导航移动与生产编译；未做登录态浏览器目检。 |

## 关联

- `docs/tasks/ai-ticket/2026-09-03-shadow-summary-worker.md`
- `docs/ai-dev/lifecycle/current-system-technical-objects.md`
- `docs/ai-dev/rules/server-code-rules.md`
