---
title: "导出 Lark tickets Excel"
module: platform-data
status: done
requirement_version: 1
created_on: 2026-09-20
updated_on: 2026-09-20
closed_on: 2026-09-20
owner: Codex
related: []
---

# 导出 Lark tickets Excel

## 目标与范围

一次性导出当前配置数据库的全部 Lark ticket 快照，包含 ticket number、ticket title、状态、business line、紧急度、类型、prepared message json、shadow ai、ticket ai。不修改应用或数据库，不触发平台同步。

## 验收标准

- [x] Excel 包含上述九列及 1,936 条记录。
- [x] JSON 原文完整保留；缺失值留空。
- [x] 文件说明注明快照范围、同步时间及 stale 数量。
- [x] 逐单元格回读与查询结果一致。

## 方案与决策

使用只读、可重复读事务，以 base_id/table_id/record_id 左连接 lark_base_ticket_syncs、lark_ticket_thread_syncs 和 lark_base_ticket_octo。Business line 复用现有清洗器。所有单元格使用文本类型，避免公式执行。全部字段均在 Excel 单元格长度限制内。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-20 | v1 | done | 生成 `/tmp/lark-ticket-export-20260920/lark-tickets-2026-09-20.xlsx`，1,936 条、九列；包含 1,569 条 stale 快照。导出时间 08:01:25 UTC。 | 数据来自已有同步快照，未实时核对 Lark；最新同步时间 2026-09-16T09:36:22.461Z。导出文件仅临时本地保存，不纳入 Git。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 数据与文件检查 | 通过 | 1,936 个复合键唯一；ZIP 完整性、XML 解析、全部单元格回读比对、UTF-16 长度及无公式检查通过 | 未使用 Excel GUI 打开 |
| 应用测试 / 部署验证 | 未执行 | 无应用代码修改 | 不涉及部署 |
