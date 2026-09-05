---
title: "Create Odoo 2.11.0 Meegle Versions"
module: "platform-data"
status: done
created_on: 2026-08-27
updated_on: 2026-08-27
closed_on: 2026-08-27
owner: "Ben Lin"
related:
  - "14366250"
  - "14366251"
  - "14366252"
---

# Create Odoo 2.11.0 Meegle Versions

## 目标

在 Tenways Software R&D 中为 Odoo EU、US、UK 创建 Default version 类型的 2.11.0 Version；发布日期为 2026-09-03。

## 验收标准

- [x] 三条 Version 名称、System、Default version 模板和发布日期均正确。

## 背景与范围

仅创建 `Od EU v2.11.0`、`Od US v2.11.0`、`Od UK v2.11.0`。不修改既有 Version 或工作流状态。

## 方案与决策

先读取实时 Meegle 元数据、查重并 dry-run；通过后创建并逐条回读。Meegle CLI 当前版本要求将每个工作项字段作为 JSON 对象传给重复的 `--fields` 参数。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-27 | done | 查重为空，三条创建和回读均成功：14366250、14366251、14366252。 | 已验证 Meegle 返回字段；未做浏览器 UI 验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Meegle CLI 运行时回读 | 通过 | 每条记录均为 Default version、2026-09-03 和对应 Odoo System。 | 仅验证 API/CLI 返回。 |

## 关联

- https://project.larksuite.com/68a2ed80e4ff51e07a71a6f6/642f8d55c7109143ec2eb478/detail/14366250
- https://project.larksuite.com/68a2ed80e4ff51e07a71a6f6/642f8d55c7109143ec2eb478/detail/14366251
- https://project.larksuite.com/68a2ed80e4ff51e07a71a6f6/642f8d55c7109143ec2eb478/detail/14366252
