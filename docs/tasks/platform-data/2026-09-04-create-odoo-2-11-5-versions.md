---
title: "Create Odoo 2.11.5 Meegle Versions"
module: "platform-data"
status: done
created_on: 2026-09-04
updated_on: 2026-09-04
closed_on: 2026-09-04
owner: "Ben Lin"
related:
  - "14544936"
  - "14544937"
  - "14544938"
---

# Create Odoo 2.11.5 Meegle Versions

## 目标

在 Tenways Software R&D 中创建 Odoo EU、US、UK 的 Default version 类型 2.11.5 Version，发布日期为 2026-09-10。

## 验收标准

- [x] 三条 Version 的名称、System、Default version 模板和发布日期均正确。

## 背景与范围

仅创建 `Od EU v2.11.5`、`Od US v2.11.5`、`Od UK v2.11.5`；不修改已有 Version 或状态。

## 方案与决策

读取实时 Meegle 元数据后，按名称查重并 dry-run；通过后创建且逐条回读。当前 Meegle CLI 要求每个工作项字段经由重复的 `--fields` JSON 对象参数提交。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-09-04 | done | 查重为空，创建并回读确认 14544936、14544937、14544938。 | 已验证 CLI/API 返回；未做浏览器 UI 验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Meegle CLI 运行时回读 | 通过 | 每条记录均为 Default version、2026-09-10 和对应 Odoo System。 | 仅验证 API/CLI 返回。 |

## 关联

- https://project.larksuite.com/68a2ed80e4ff51e07a71a6f6/642f8d55c7109143ec2eb478/detail/14544936
- https://project.larksuite.com/68a2ed80e4ff51e07a71a6f6/642f8d55c7109143ec2eb478/detail/14544937
- https://project.larksuite.com/68a2ed80e4ff51e07a71a6f6/642f8d55c7109143ec2eb478/detail/14544938
