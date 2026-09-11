---
title: "Lark Ticket 列表与详情显示 Business line"
module: ai-ticket
status: completed
requirement_version: 1
created_on: 2026-09-11
updated_on: 2026-09-11
closed_on: 2026-09-11
owner: TBD
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# Lark Ticket 列表与详情显示 Business line

## 目标

FE Lark Ticket 列表及详情页显示现有同步数据的 Business line。

## 验收标准

- [x] 列表默认显示 Business line，可通过既有显示字段配置隐藏；详情 Properties 同时显示。
- [x] 服务端复用字段清洗解析字符串、选项对象和数组，源字段不暴露给 FE；无值时展示“未设置”。
- [x] FE 测试/构建及 Server 测试/构建通过。

## 背景与范围

原同步快照 `sourceFields` 已保存 `Business line`，列表 API 原先只从中补齐需求人，随后移除原始字段。详情复用同一列表投影。本次增加只读 `businessLine` 投影，无数据库迁移或重新同步要求，不增加编辑、筛选和分组能力。

## 方案与决策

- 字段结构解析继续放在 `lark-ticket-cleaning.ts`，Web 投影由 `PlatformDataService` 选择性返回。
- 列表复用已有文字元数据与显示配置；详情复用 `TicketProperty` 的空值展示。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-11 | v1 | in_progress | 完成 API 投影、默认显示字段、列表行与详情属性显示；补充源字段形态与隐藏/空值回归。 | 验证结果见下表。 |
| 2026-09-11 | v1 | completed | FE 包级检查、14 项列表相关测试、Server 816 项测试及构建通过；同步产品文档。 | 未部署，未做真实登录浏览器验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 测试/构建 | 通过 | `pnpm --dir fe check`：37 个测试文件通过、Vite 构建通过；`node --test --test-isolation=none fe/src/lib/platform-list-rows.test.js fe/src/lib/lark-ticket-view-config.test.js`：14 项通过。 | 未做真实浏览器布局验收。 |
| Server 测试/构建 | 通过 | `pnpm --dir server test`：816 项通过、1 项跳过；`pnpm --dir server build` 通过。 | 跳过未配置环境的原生 Hermes 协议测试，与本次显示字段无关；API 投影测试使用 mock store。 |

## 关联

- [同步与 Web 列表说明](../../tenways-octo/it-platform-sync.md)
