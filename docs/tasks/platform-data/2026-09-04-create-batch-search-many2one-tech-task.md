---
title: "Create batch-search many2one Tech Task"
module: "platform-data"
status: blocked
requirement_version: 1
created_on: 2026-09-04
updated_on: 2026-09-04
closed_on: null
owner: "Ben Lin"
related:
  - "Meegle Tech Task: 批量搜索 支持 many2one 字段"
---

# Create batch-search many2one Tech Task

## 目标

创建 Tech Task「批量搜索 支持 many2one 字段」，指定 Ben Lin 为任务负责人和 FE 角色成员，Business line 为 Software center、Tech Team 为 Dev Team 2、System 为 Odoo EU。

## 验收标准

- [ ] Meegle 中存在唯一同名 Tech Task，且上述字段与角色成员均回读一致。

## 背景与范围

用户明确要求使用本地 `meegle` CLI；不通过网页或其他 API 创建，不创建缺少必填 FE 角色的半成品。

## 方案与决策

创建前已按标题查重，结果为空。CLI 的 `workitem create` 只公开 `fields`，但目标类型将 FE 角色设为服务端必填。尝试服务端报错中提供的完整角色字段键仍被拒绝，故停止重试。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-04 | v1 | blocked | 同名 MQL 查重为空；`meta-roles` 返回 FE 角色；创建接口先报 FE 必填，携带完整角色字段键后报 `ErrInvalidParam`。未创建工作项。 | 需要支持创建时传角色成员的 CLI 修复，或用户允许改用其他受支持渠道。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Meegle CLI 元数据与创建调用 | 失败，未写入 | `meta-create-fields` 显示 6 个普通必填字段；`meta-roles` 显示 FE；创建服务端拒绝 FE 角色传参 | CLI 创建参数不支持服务端必填角色成员 |

## 关联

- `.learnings/ERRORS.md` ERR-20260904-002
