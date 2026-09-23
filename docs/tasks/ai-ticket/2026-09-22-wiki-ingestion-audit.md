---
title: "LLM wiki Ticket 摄入现状核查"
module: ai-ticket
status: done
requirement_version: 2
created_on: 2026-09-22
updated_on: 2026-09-23
closed_on: 2026-09-22
owner: TBD
related:
  - "./2026-09-11-ticket-source-fields-and-wiki-snapshots.md"
---

# LLM wiki Ticket 摄入现状核查

> 本任务已完成的是 2026-09-22 的只读核查及队列交付，以下统计保留为当次快照，不是当前账本状态。后续历史 skip 已在[重评任务](2026-09-22-historical-skip-reprocess.md)重开处理；下一步执行顺序与未完成项统一维护在那里。

## 目标与范围

只读核对 Octo 已同步 Ticket、wiki raw 和逐票账本，交付已摄入及待处理清单。按当前 Finish 范围区分内容处理与草稿审核；不刷新 Lark、不调用总结、不修改 wiki 或数据库。

v2：在已核查的数据快照上生成按 Ticket 去重的待处理队列表格，包含简明处理说明、优先级和依赖；不重新查询或执行摄入。队列是本次核查的派生产物，不替代 wiki 权威账本。

## 验收标准

- [x] 核对主键唯一性、来源范围、同步时间和 raw 多版本。
- [x] 区分已登记处理、仅 raw、尚无 raw、证据漂移与证据缺失。
- [x] 交付不含消息正文和凭证的清单、可复跑检查和验证边界。
- [x] 合并新增、字段变化和账本修复清单，交付无重复且保留所有处理事项的队列表格。

## 方案与决策

数据库使用只读事务；消息与选定源字段只在内存中计算指纹，不输出或保存业务 payload。wiki 按 record_id 关联，检查跨 scope 歧义。现有账本不记录完整处理指纹，不能把有账本行等同于已处理当前版本。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-22 | v1 | in_progress | 已确认 raw 与账本存在，开始只读对账。 | 尚未确认数据库连接、实际数量与漂移。 |
| 2026-09-22 | v1 | done | 19:21 香港时间读取 tenways_octo_test：1936 张票、单一 scope；Finish 1703。raw 3712 份对应 1856 张票，账本 1840 行。Finish 中 357 有卡路径、1312 判定 skip、16 已被 concepts 引用但漏账本、18 无 raw/账本。已核对 ID 唯一及多版本末端无歧义。 | 最新 Ticket synced_at 为 2026-09-16 17:36 香港时间，不代表 9 月 22 日源端现状。 |
| 2026-09-22 | v2 | done | 按 record_id 合并三个已核查清单，生成 90 张去重队列：建议 P1 内容处理 48 张、P2 仅账本修复 42 张；12 张同时有字段变化和旧路径问题保留双事项。2192、2228 标记待补聊天。CSV/Markdown 行数、身份唯一性和事项覆盖断言通过。 | 基于 v1 快照，未重新同步或执行队列；不替代 wiki 权威账本。 |
| 2026-09-23 | v2 | done | 按原 90 张 record_id 关联当前账本：82 张 source_reviewed、8 张待补证，13 张历史 skip 交集已登记复核。更新后续衔接及任务索引。 | 保持核查交付 done；未重做 DB/Lark 核查或逐项验收旧队列，旧报表仍为历史快照。 |

## 结果与证据

产物目录：`/home/deploy/.codex/visualizations/2026/09/17/01a0ae12-6507-7642-b98c-f6fe49dfb989/wiki-ingestion-audit-20260922/`。

- `tickets.csv` 全部 1936 张；`finish-new.csv` 新增 18 张（16 张数据库材料齐备；2192、2228 缺完整聊天）。
- `finish-changed.csv` 为 30 张已摄入 Finish 的源字段指纹变化：17 张有关联卡、13 张历史 skip；不包含消息清洗格式差异。
- `ledger-repairs.csv` 为 54 条登记修复：16 条漏账本、38 条旧路径；38 条均找到唯一同名 concepts 候选，尚未确认语义映射或修改账本。该清单与字段变化清单可重叠。
- `audit.ipynb`、`audit.py`、`finalize.py`、`audit.sql` 保存复跑步骤；数据库只读事务，原始字段及消息仅在内存处理。
- `pending-ticket-queue.md` / `pending-ticket-queue.csv` 为 v2 派生队列，包含处理事项、简明步骤、前置检查、相关路径；CSV 另含待填写的处理结果和完成时间。`generate_queue.py` 保存生成逻辑，`pending-ticket-queue-checks.json` 记录统计与输入 SHA-256。
- 136 份 raw 的完整 YAML 解析失败，使用白名单身份/版本字段继续对账；未修复 raw。
- 1810 个有消息的历史 Ticket 对应数据库 prepared 清洗版本为 v3；历史 sha256 与已检查的 JSON 口径均不匹配。此差异没有判为源端聊天变化。已有 raw 的 Finish 在数据库中未发现 snapshotVersion 差异，但不证明源端最新。
- 1556 张 Finish 的 stale 标记需要独立核实，不能据此认定已删除。静态代码存在 full 过滤终态、随后标记未见记录的组合；这里只记录可能原因，不宣称完成根因验证。
- 账本质量状态 pending=353、skipped=1487，无 human_reviewed；存在卡引用不等于人工审核通过。

## 后续处理衔接（2026-09-23 更新）

**核查任务保持 `done`，完成范围仍是 09-22 的只读核查和队列交付。** 本次重新关联当前 wiki 权威账本，更新后续进度，不覆盖前述历史统计，也不代表完成后续摄入的逐项验收。

原 90 张队列均已登记在当前账本：

| 当前账本状态 | 数量 |
| --- | ---: |
| source_reviewed / draft | 73 |
| source_reviewed / historical_case | 2 |
| source_reviewed / no_distill | 7 |
| triaged / needs_evidence | 8 |

8 张待补证为 **2194、2224、2192、175、991、1230、1578、1584**。原文复核已登记 82 张；draft 不等于人工签核。与原始 1312 张历史 skip 重叠的 13 张目前均为 source_reviewed（11 draft、2 historical_case），原“均未复核”的衔接说明已过期。后续仍由[历史重评任务](2026-09-22-historical-skip-reprocess.md)管理。

原 CSV 的“处理结果/完成时间”均未填，仍保留为 09-22 核查证据；不能把 82 张 source_reviewed 直接视为源字段漂移、路径修复等所有事项均已验收。下一轮应按事项逐项检查 raw、知识页和账本，避免只按票的知识状态清空待办。

此次关联的 state.jsonl 有 1936 个唯一 record_id，SHA-256 为 `cfaf8f89ba95827d126a5e495ce96f3f834bd4351f355c853d0e48adefb48ace`。未查询数据库/Lark、未修改 wiki/账本或执行新摄入；源端新鲜度及语义质量仍未验证。

## 验证

只读数据库核查完成；CSV 数量和 record_id 唯一性断言通过，raw/账本无数据库孤儿记录。未运行应用测试，未刷新 Lark、未运行总结、未修改数据库或 wiki。不代表 Lark 源端最新状态或 wiki 内容语义审核通过。

报告交付：`report.md`、四份 CSV 与可复跑 notebook 已生成。HTML 规范渲染器通过数据打包和图表提取，但桌面 1440px 排版检查持续返回 `horizontal_overflow`，缩短路径和减少列后仍失败，因此不交付未通过检查的 HTML；不影响已验证的统计与逐票清单。
