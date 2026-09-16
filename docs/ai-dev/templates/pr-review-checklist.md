---
status: draft
owner: TBD
last_reviewed: 2026-06-08
scope: PR review checklist for Odoo lifecycle, runtime, vendor, integration, and tests
update_required_when:
  - 调整 PR Review 要求
  - 新增治理规则或风险类型
---

# PR Review Checklist

涉及核心业务逻辑的 PR 应检查以下内容。

## 生命周期

- 是否查阅对应生命周期扩展地图。
- 是否说明生命周期节点。
- 是否说明 hook 放置理由。
- 是否检查重复覆盖、交叉覆盖和 `super()` 顺序。
- 是否列出相关 context flag。

## 运行时行为

- 是否影响 server action、automation、cron、Studio。
- 是否影响邮件模板、printout/PDF、QWeb report。
- 是否影响权限、record rule、Portal 可见性。
- 是否影响配置参数或关键主数据。

## 事务与直接 SQL

- 是否新增或修改 `env.cr.execute()`、`env.cr.commit()`、`env.cr.rollback()`、`savepoint()`、新 cursor 或批量 job。
- 如果使用直接 SQL，是否说明为什么 ORM 不适合。
- 如果使用手工 `commit()`，是否定义了独立更新单位、commit 边界、batch size、checkpoint 和重跑方式。
- P0 财务/库存 SQL 修复是否默认提供 dry-run、影响行数、old/new 值、rollback 或补偿方案。
- SVL/AML/account.move/account.move.line 修复是否检查 stock lock date、account lock date、tax lock、reconciled AML 和 posted AML review reset 策略。
- 是否有幂等 key、状态 claim、`FOR UPDATE SKIP LOCKED` 或等价机制，避免并发重复处理。
- SQL 后如果继续读取 ORM recordset，是否 invalidate cache 或重新 browse。
- 是否有成功、失败、中途失败后重跑、重复执行、并发执行测试或演练记录。

## 第三方与集成

- 是否修改或依赖 vendor 模块。
- 是否通过 adapter 管理 vendor 行为。
- 是否影响外部系统。
- 是否具备幂等、重试、失败状态和补偿。

## 测试

- 是否运行核心黄金测试。
- 是否补充必要测试。
- 未运行测试时是否说明原因和剩余风险。

## 文档

- 是否更新 `docs/ai-dev/lifecycle/`。
- 是否更新 `docs/ai-dev/runtime/`。
- 是否更新 vendor、migration 或 rules 文档。
- 是否按 `docs/ai-dev/governance/runtime-map-usage-review-plan.md` 完成 owner、review 状态和必要签收。
