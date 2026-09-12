---
title: "Lark Ticket 未展示源字段核查"
module: ai-ticket
status: completed
requirement_version: 1
created_on: 2026-09-11
updated_on: 2026-09-11
closed_on: 2026-09-11
owner: TBD
related:
  - "./2026-09-11-lark-ticket-business-line-display.md"
---

# Lark Ticket 未展示源字段核查

## 目标

核对 Lark Base 已同步字段与 FE 列表、详情展示，提出值得补充的信息；本任务仅核查和建议。

## 验收标准

- [x] 根据真实本地快照字段确认遗漏，区分空关联容器与有效业务值。
- [x] 给出展示位置与优先级，记录数据与验证边界。

## 背景与范围

只读查询 `lark_base_ticket_syncs.fields_json`，连接强制 `default_transaction_read_only=on`；输出仅字段名、非空数量、JSON 类型和结构计数，不输出 Ticket 内容、人员信息、附件链接或凭据。

本地共 1,906 条记录，快照同步时间范围为 2026-08-07 01:47:05 UTC 至 2026-09-11 02:58:20 UTC。统计反映已有同步数据，不代表源端实时完整状态。“非空”初筛排除 JSON null、空字符串、空数组、空对象；对关联字段另查结构，不能把包含空 record_ids 的容器计为真实关联。

## 方案与决策

以下为建议，未作为实施授权：

| 优先级 | 源字段 | 非空源记录数 | 建议位置与用途 |
| --- | --- | --- | --- |
| 高 | 解决方案 | 384 | 详情正文独立区域，查看已记录的处理办法，并与 AI 生成内容区分。 |
| 高 | 创建时间 / 关闭时间 | 1,906 / 1,511 | 详情 Properties；列表按需展示创建时间，判断积压及关闭时间。 |
| 高 | Planned Version / Planned Sprint | 339 / 161 | 列表可选元数据及详情 Properties，查看排期。 |
| 高 | 预计修复日期 | 61 | 详情 Properties，列表可选，查看修复承诺。 |
| 中 | Attachments | 56 | 详情 Resources 展示附件名与可用访问入口；附件含源端 URL、临时 URL 和凭据标识，不直接原样透传。 |
| 中 | 上级ticket / 关联需求 | 待按有效关联 ID 统计 | 详情关系区，帮助理解父子单与需求归属；源结构存在两种版本，许多容器实际无关联。 |
| 低 | tag | 95 | 详情属性或列表可选标签。 |

`MeegleVersion` 另有 579 条非空源记录，包含字符串与数字，语义未确认，不能当作 Planned Version 或已发布版本直接合并。`创建周数`、`关闭周数`、`开始天数`、`总耗时` 为公式/计算结果，单位与口径未核对，不优先加入业务详情。财务专用字段可待明确使用场景后再展示。

现有页面已经显示标题、描述、状态、紧急度、类型、需求人、负责人、Business line、Lark/Meegle 资源链接，以及独立 Ticket AI 信息。列表更新时间与详情“同步于”是现有技术时间信息，不能替代创建/关闭时间。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-11 | v1 | completed | 完成 FE/API 代码对照、源字段非空聚合和候选字段结构核对；形成上述建议。初步非空容器统计会高估关联字段，进一步结构核对后排除该推断。 | 仅建议，未新增界面字段；源端实时字段定义、附件访问和公式语义未验证。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 数据只读核查 | 完成 | `jsonb_each(fields_json::jsonb)` 按字段聚合存在数、非空数、JSON 类型；候选字段结构在进程内归纳后只输出结构与数量。 | 未读取实时 Lark Base API；仅本地同步快照。 |
| 代码对照 | 完成 | `fe/src/pages/LarkTicketDetailPage.jsx`、`fe/src/lib/lark-ticket-view-config.js`、`server/src/application/services/lark-ticket-cleaning.ts`、`platform-data.service.ts`。 | 无产品代码修改，无需重复执行测试。 |

## 关联

- [Business line 展示任务](./2026-09-11-lark-ticket-business-line-display.md)
