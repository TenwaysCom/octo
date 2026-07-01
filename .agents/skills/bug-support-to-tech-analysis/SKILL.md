---
name: bug-support-to-tech-analysis
description: |
  This skill converts a confirmed Bug Support-layer spec (Part A) plus code context into the
  Technical Analysis spec (Part B) for developer review and AI bug-fix tasks.
  It should be used when a developer needs to analyze root cause, assess impact, propose a fix
  approach, and plan data repair — all based on the support spec and relevant code. Final
  confirmation by a human developer is required. Output is written to docs/ai-dev/specs/.
agent_created: true
---
# Bug Support Layer → Technical Analysis

Convert a confirmed **Part A (Support Layer)** spec plus code context into the
**Part B (Technical Analysis)** spec as defined in `docs/ai-dev/templates/bug-tech-spec-template.md`.

## Important constraint

The output is a **draft for developer review**. Root cause and fix approach are marked as
"需研发定位确认" — a human developer MUST confirm before the fix is implemented.

## Output sections

| Section | Content |
|---------|---------|
| B1. 受影响对象（精确） | Precise list of affected core objects, impact type, lifecycle doc references |
| B2. 根因分析 | Suspected module, error category (logic/boundary/override-chain/config/data), suspected direction — exact file/line left for developer |
| B3. 影响分析（技术视角） | Affected data volume, downstream impact, runtime impact, permissions, performance |
| B4. 修复方案（草案） | Suggested fix approach, involved hooks, old-behavior impact, data repair needed |
| B5. 数据修复（如需要） | Repair scope, method, environment, rollback plan |
| B6. 测试验证 | 4+ test scenarios: repro, boundary, regression ×2 |
| B7. 治理文档更新 | docs/ai-dev/ files needing update |

## Guiding principles

- Do not guess exact line numbers — provide module-level suspicion and error category.
- Mark uncertain items as "待确认" or "需研发定位".
- The fix approach is a draft suggestion; do not execute.
- Read the lifecycle documents in `docs/ai-dev/lifecycle/` for context before writing.

## Prompt

```text
你是一名 Odoo 技术研发工程师。请根据以下 Support 层 Bug 描述和代码上下文，生成技术分析层草案。

## 背景
本项目是 Odoo 17 定制化项目，包含自研模块（Tenways/）、Odoo 标准模块（odoo-17/）和第三方购买模块（Tenways/vendor/）。
核心规则：
- 默认不修改 odoo-17/ 标准模块和第三方购买模块。
- P0 核心对象修改需标注生命周期节点。
- 不确定的地方标注"待确认"。

## 输出要求
请按以下结构输出。无法从现有信息确定的字段标注"待确认"或"需研发定位"。

### B1. 受影响对象（精确）
- 列出受影响的核心对象，标注类型和影响方式
- 引用对应的 lifecycle 文档路径

### B2. 根因分析
- 给出初步怀疑方向：哪个模块、哪种类型的问题（逻辑错误/边界未处理/覆盖链冲突/配置/数据）
- 标注"需研发定位确认"，不要写确切文件路径和行号

### B3. 影响分析（技术视角）
- 已影响数据量、下游影响、运行时影响、权限影响
- 不确定的量级标注"需查询确认"

### B4. 修复方案（草案）
- 建议修复方式和涉及的 hook
- 标注是否影响旧行为、是否需要数据修复
- 给出修复方案概要（为什么这样修）

### B5. 数据修复（如需要）
- 如现象涉及异常数据，给出修复范围建议
- 标注修复方式、是否需要停机

### B6. 测试验证
- 给出至少 4 个测试场景：原 Bug 复现、边界、回归×2

### B7. 需要更新的治理文档
- 根据受影响对象列出 docs/ai-dev/ 下需要更新的文件

## 关键原则
- 不要猜测确切的根因代码行号，只给怀疑方向和模块级定位。
- 不确定的地方必须标注"待确认"或"需研发定位"。
- 修复方案只是建议草案，不执行，由研发确认后再开发。

## Support 层描述

{SUPPORT_LAYER}

## 代码上下文（可选）

{CODE_CONTEXT}
```
