---
title: "Meegle 标准 Bugs 增量清洗 TODO"
module: "platform-sync"
status: planned
backlog: true
requirement_version: 3
created_on: 2026-09-01
updated_on: 2026-09-04
closed_on: null
owner: TBD
last_reviewed: 2026-09-04
related:
  - "Meegle work item type: issue"
  - "docs/tasks/platform-sync/2026-09-01-meegle-system-time-incremental-cleaning.md"
---

# Meegle 标准 Bugs 增量清洗 TODO

## 目标

将 Tenways Software R&D 的标准 Bugs（type key/API name 均为 `issue`）纳入 Meegle 增量同步和 canonical cleaner。该事项暂列 backlog；本期不修改服务端映射、活跃 target 或 checkpoint，后续启动范围与 System 规则须先讨论确认。

## 验收标准

- [ ] `issue` 拥有独立 `projectKey/workItemTypeKey` checkpoint，并加入明确配置的增量 target。
- [ ] 直接同步 `start_time` 与 `updated_at`；`item_finish_time` 始终为空，不以 `updated_at` 或状态时间近似。
- [ ] System 字段方案经产品确认并具备来源清空、非法值告警测试。
- [ ] 上线只处理 checkpoint 捕获记录，不主动扫描历史 Bugs。

## 背景与范围

2026-09-01 只读 Meegle 元数据核对确认：

- 工作项类型为 `issue`，显示名为 `Bugs`。
- 存在 `start_time`（Submission Time）和 `updated_at`（Updated Time），不存在 `finish_time`。
- `field_b66db8`（Affected System）只有 Odoo/Portal 等大类，不能单独识别区域。
- `field_19682c`（Relavant System）为区域树字段，包含 Odoo/Portal 的 EU、US、UK，可作为区域清洗候选来源。
- 当前 `server/config/platform-sync.local.json` 未配置 `issue`，现有 cleaner 也没有 `issue` 映射，因此当前自动/增量同步不会处理标准 Bugs。

## 方案与决策

后续实现应复用 Story/Tech Task/Production Bug 的 canonical date、updated-at、warning 和 checkpoint 行为。System 推荐以 `field_19682c` 为区域权威字段；`field_b66db8` 只能作为诊断上下文，不能把无区域的 Odoo/Portal 猜成 `eu`、`us` 或 `uk`。正式实现前确认是否需要其他业务 fallback。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-01 | v1 | planned | 已确认类型、时间字段、System 字段和当前未配置状态。 | 产品确认 System fallback 后另行排期实现。 |
| 2026-09-04 | v1 | blocked | 台账复核确认 `issue` 仍没有对应 lifecycle field 映射或已配置的增量 target；没有开始 checkpoint、cleaner 或历史扫描。 | 需要产品负责人明确：`field_19682c` 是否为唯一 System 权威来源，以及是否允许任何 fallback。收到书面决策后，按验收顺序建立 target/checkpoint、日期规则与来源清空/非法值告警测试。 |
| 2026-09-04 | v3 | planned | 按本期优先级调整移入 backlog；已撤回未提交的 `issue` 映射、测试和架构说明改动，未修改活跃 config 或 checkpoint。 | 后续讨论并确认 System 来源、是否允许 fallback、激活时的 checkpoint 初始化方式与维护窗口后，再递增需求版本实施。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Meegle 元数据只读核对 | 通过 | `meta-types`、`meta-fields` 与 MQL 小样本。 | 未创建/更新工作项，未初始化 checkpoint。 |

## 关联

- `docs/tenways-octo/it-platform-sync.md`
