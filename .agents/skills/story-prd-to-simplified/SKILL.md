---
name: story-prd-to-simplified
description: |
  This skill converts a PRD document into a simplified Story requirements confirmation spec (Part A).
  It should be used when the user provides a PRD and needs a structured, developer-ready summary for review,
  including business context, user stories, affected Odoo objects, lifecycle nodes, risk pre-assessment,
  and open questions. Output is written to docs/ai-dev/specs/.
agent_created: true
---
# Story PRD → Simplified Requirements Spec

Convert a PRD document into the **Part A (Simplified Requirements)** spec as defined in
`docs/ai-dev/templates/story-tech-spec-template.md`.

## Output sections

| Section | Content |
|---------|---------|
| A1. 需求概述 | Title, type, priority, requester, target date |
| A2. 业务背景 | 2-5 sentences: why needed, what pain solved |
| A3. 用户故事与验收条件 | User stories in "As a <role>, I want <feature>, so that <goal>" format |
| A4. 主对象与生命周期 | Core objects, likely lifecycle nodes (action_confirm / button_validate / action_post / write ...) |
| A5. 潜在风险分析 | Override-chain conflict, vendor modules, integrations, performance, permissions, data migration |
| A6. 待澄清问题 | Ambiguities found in PRD, with impact and status |

## Guiding principles

- Describe **what to do**, not **how to do it** (implementation left to developers).
- Risk analysis is pre-assessment, not final conclusion.
- Never modify `odoo-17/` standard modules or third-party vendor modules by default.
- P0 core objects must reference lifecycle nodes.
- Mark uncertain items as "待确认" or "待研发评估".
- Mark unclear PRD points as "待产品确认".

## Prompt

```text
你是一名 Odoo 技术项目经理。请根据以下 PRD 文档，生成一份简化的需求确认文档，用于研发评审。

## 背景
本项目是 Odoo 17 定制化项目，包含自研模块（Tenways/）、Odoo 标准模块（odoo-17/）和第三方购买模块（Tenways/vendor/）。
核心业务对象包括 sale.order、stock.picking、account.move、res.partner、product.product 等。

## 输出要求
请按以下结构输出，每个字段都必须填写（不确定的标注"待确认"）。

### A1. 需求概述
- 标题、类型（新功能/功能增强/重构/集成对接）、优先级（P0-P2）、提出方、目标上线

### A2. 业务背景
- 从 PRD 提取，2-5 句话说明为什么需要、解决什么痛点

### A3. 用户故事与验收条件
- 从 PRD 提取用户故事（格式：作为<角色>，我希望<功能>，以便<目的>）
- 每个故事配验收条件

### A4. 主对象与生命周期（初步判断）
- 主对象、关联对象
- 可能介入的生命周期节点（action_confirm / button_validate / action_post / write 等）
- 引用已有 lifecycle 文档路径

### A5. 潜在风险分析
- 覆盖链冲突、第三方模块、外部集成、性能、权限、数据迁移
- 每个风险标注等级和关注点，不确定的标注"待研发评估"

### A6. 待澄清问题
- 从 PRD 中发现的模糊点，列出问题、影响范围
- 标注"待产品确认"

## 关键原则
- 只描述"需要做什么"，不写"怎么做"（实现方案留给研发）。
- 风险分析是预判，不是结论。
- 默认不动 odoo-17/ 标准模块和第三方购买模块。
- 涉及 P0 核心对象必须标注生命周期节点。
- 不确定的地方标注"待确认"或"待澄清"。

## PRD 文档内容

{PRD_CONTENT}
```
