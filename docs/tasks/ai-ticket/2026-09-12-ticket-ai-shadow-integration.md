---
title: "Ticket 详情页 Ticket AI 区块整合影子分析"
module: "ai-ticket"
status: done
requirement_version: 1
created_on: 2026-09-12
updated_on: 2026-09-12
closed_on: 2026-09-12
owner: TBD
related:
  - "docs/tasks/ai-ticket/2026-09-06-shadow-ai-fe-details.md"
---

# Ticket 详情页 Ticket AI 区块整合影子分析

## 目标

Ticket 详情页 "Ticket AI" 三张卡（AI 分析/知识沉淀/证据与回归）此前只读取正式 `ticketAi` 字段，绝大多数 Ticket 因未写回而全部显示"暂无数据"，而内容更全的影子分析只堆在右侧栏。本次把影子字段按语义整合进三张卡并定义信息分层：卡面摘要、hover 明细、点击展开完整详情；右侧栏面板按用户要求精简为意图、置信度、问题总结、方案摘要四项。不改 Server、影子 Worker、Prompt 或正式写回流程。

## 验收标准

- [x] 影子字段按语义映射进三卡：AI 分析（意图/置信度/问题总结/意图摘要/处理状态/处理人/解决时间）、知识沉淀（方案摘要/答案置信/处理步骤/质量摘要/自动处理/自动化建议）、证据与回归（关键词/证据/严重问题/警告）。
- [x] 信息分三层：卡面展示关键摘要（正式优先，影子兜底）；hover 卡片弹出该卡完整影子字段（复用列表页 tooltip 交互）；点击"查看"展开正式字段 + 带来源标注的影子字段 + 分析元信息。
- [x] 卡片状态徽标区分来源：已生成（正式，绿色）/ 影子分析（仅影子，紫色，沿用列表页 `#5b45a5/#ede9fe` 配色）/ 暂无数据。
- [x] 区块标题行右侧：正式 → "Octo 本地记录"；仅影子 → `影子分析 · {分析时间}`；影子跳过/失败 → 对应状态；全无 → "暂无记录"。
- [x] 影子 skipped/error 不产生影子字段；失败原因/错误码在展开的 AI 分析卡内以 notice 展示。
- [x] 右侧栏影子面板精简为状态徽标 + 意图、置信度、问题总结、方案摘要 + 分析元信息行。
- [x] `getTicketAiSections(fields)` 旧签名向后兼容，既有测试不破坏。
- [x] `pnpm --dir fe test` 与 `pnpm --dir fe build` 通过。

## 背景与范围

`ticket.shadowAi` 与 `ticket.ticketAi` 同随 `GET /api/web/platform-data/lark-tickets` 返回，整合为纯 FE 展示层改动。列表页 AI 输出视图已有"正式优先、影子兜底 + hover 详情"的成熟模式（`lark-ticket-ai-pipeline.js`），本次沿用其语义与配色。范围不含：影子字段回写 Lark、新的读取 API、AI Sessions/待确认操作区块。

## 方案与决策

- `fe/src/lib/ticket-ai-sections.js` 新增 `SHADOW_SECTION_FIELDS` 三卡映射、`getTicketAiShadowItems`（仅 status==="ok"，空值过滤）、卡面摘要行、`getTicketAiShadowNotice`；`getTicketAiSections` 增加可选 `shadowAi` 参数，输出 `shadowItems`/`shadowSummary`/`hasFormalData`/`hasShadowData`，`hasData` 取或。
- 用户确认的信息分层（未逐项投票，按推荐执行）：卡面=关键摘要；hover=该卡影子字段全量；展开=正式+影子双来源标注。
- 用户明确要求：右侧栏保留意图、置信度、问题总结、方案摘要（替代原计划的整体移除）。
- 影子卡与来源标注使用列表页既定 shadow 紫色调，与正式记录的绿色区分，传达"自动生成、未确认"。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-12 | v1 | done | 三卡影子映射、三层信息展示、右侧栏精简面板、notice 与配色完成；`pnpm --dir fe test`（207/207）、`pnpm --dir fe build` 通过。 | 未做登录态浏览器目检（`make server-dev` + `make fe-dev` 场景待人工确认）。 |

## 验证

评审修复（2026-09-12）：点击展开后按钮保留焦点，原 `:focus` 规则会让 tooltip 持续遮挡详情。现仅允许 `aria-expanded="false"` 的卡片在 hover/focus 时显示 tooltip；展开后隐藏，收起后恢复。修复后 `pnpm --dir fe test`、`pnpm --dir fe build`、`git diff --check` 均通过；未执行浏览器交互验证。

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 全量测试 | 通过 | `pnpm --dir fe test`（207/207，含新增 5 个影子整合用例） | 不替代浏览器视觉验收。 |
| FE 构建 | 通过 | `pnpm --dir fe build` | Vite production build。 |
| 浏览器目检 | 未执行 | - | 仅影子数据 Ticket 的三卡点亮、hover tooltip、展开来源标注、右侧栏精简面板待人工核对。 |

## 关联

- `docs/tasks/ai-ticket/2026-09-06-shadow-ai-fe-details.md`（右侧栏影子面板初版与列表页整合模式）
- `fe/src/lib/lark-ticket-ai-pipeline.js`（正式优先 + 影子兜底的既有语义来源）
