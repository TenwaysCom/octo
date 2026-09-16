---
title: "Lark Ticket 紧急度、状态与业务线统一配色"
module: "platform-data"
status: completed
requirement_version: 1
created_on: 2026-09-11
updated_on: 2026-09-11
closed_on: 2026-09-11
owner: jack
related:
  - "docs/tasks/platform-data/2026-09-11-lark-ticket-context-menu-actions.md"
  - "docs/tasks/platform-data/2026-09-11-lark-ticket-detail-field-editing.md"
---

# Lark Ticket 紧急度、状态与业务线统一配色

## 目标

列表、分组/看板、详情及两处编辑菜单中的紧急度、状态、Business Line 采用一致且易区分的颜色。保留原字段文字，不改变业务数据与写入协议。

## 验收标准

- [x] P0 为最紧急：红底白字；P1 橙色、P2 蓝色、P3 青绿色。
- [x] 待处理琥珀色、设计橙色、调研青色、进行中蓝色、评审紫色、完成绿色、取消灰色、拒绝/阻塞红色、分诊粉色。
- [x] Finish 正确归入完成，Cancelled/已取消不再映射为完成。
- [x] Business Line 按归一化名称稳定映射到八色分类色板，空值保持中性颜色；同名业务线跨页面颜色一致。
- [x] 菜单选项色点与展示标签共用语义映射。

## 背景与范围

页面已共用 LarkTicketBadge；旧映射漏掉源状态 Finish/Cancelled/Rejected，业务线统一使用默认灰色。

## 方案与决策

集中修改 lark-ticket-badges.js 语义映射及对应 CSS；菜单 helper 复用同一业务线映射。Business Line 色板是稳定分类标记，有限色板不保证任意数量/名称均无颜色重复；原名称始终保留。未知状态继续使用中性色。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-11 | v1 | completed | 三类 widget 配色完成，验证共享显示链路、测试和浏览器色板截图 | 不涉及平台写入 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 测试 | 通过 | pnpm --dir fe test，39 个文件；新增状态分类与业务线名称稳定性用例 | 本地函数 |
| 生产构建 | 通过 | pnpm --dir fe build | FE |
| 浏览器色板 | 通过 | 对 P0/P1/P2、九类状态、五个业务线样例校验实际 CSS 色值，并检查截图 | 本地样例，非真实平台数据 |
| 差异检查 | 通过 | git diff --check | - |

## 关联

- [列表右键菜单](2026-09-11-lark-ticket-context-menu-actions.md)
- [详情属性编辑](2026-09-11-lark-ticket-detail-field-editing.md)
