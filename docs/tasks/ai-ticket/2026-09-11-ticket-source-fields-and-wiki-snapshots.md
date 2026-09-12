---
title: "Ticket 时间、解决方案与 wiki 源字段快照"
module: ai-ticket
status: completed
requirement_version: 1
created_on: 2026-09-11
updated_on: 2026-09-11
closed_on: 2026-09-11
owner: TBD
related:
  - "./2026-09-11-lark-ticket-business-line-display.md"
  - "./2026-09-11-lark-ticket-field-display-audit.md"
---

# Ticket 时间、解决方案与 wiki 源字段快照

## 目标

仅补充 FE 创建时间、关闭时间、解决方案；Business line 使用 widget。Business line、创建时间、解决方案同时进入 llm-wiki 后续取证快照，并按用户确认补齐历史新版本。用户另要求提交 Octo 改动。

## 验收标准

- [x] 列表/详情展示三个字段，Business line 复用标签 widget；字段由 Server 解析，日期按 Lark 毫秒时间戳归一化。
- [x] Octo 包级测试与构建通过。
- [x] 提交 Octo 改动（`3c532d0`）。
- [x] wiki 后续取证两个入口均返回三个字段及独立源字段哈希。
- [x] 历史 raw 以带日期的新版本补齐，旧文件、线程正文、线程哈希和线程 snapshot_version 保持原值。

## 背景与范围

FE 与 Server 在 Octo 仓库；wiki 取证脚本位于 `odoo-eu-guide/.agents/skills/write-support-qa/scripts/octo-ticket-evidence.sh`，raw 位于该仓库的 `docs/llm-wiki` 子模块。读取本地同步数据，不修改 Lark Base、不触发 LLM 或正式业务写回。不增加排期、附件等未选择字段。

## 方案与决策

- FE 列表默认增加创建时间；关闭时间和解决方案作为可选显示字段，避免挤占标题。详情 Properties 显示两种时间，正文单独显示解决方案。
- wiki 使用 `business_line`、`ticket_created_at`、`solution`，源文本按既有 v2 规则脱敏；`ticket_fields_sha256` 独立于线程 `sha256`，判断重摄入时同时比较两个哈希。
- 历史新版本标记 `supersedes` 和源字段独立时间，不把当前源字段更新时间伪装成原线程更新时间；没有对应源记录时明确跳过，不猜测。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-11 | v1 | in_progress | 完成 Octo 字段和 widget 改造；wiki 取证/版本生成脚本已在临时目录准备，3 项 Python 测试通过。用户确认后续和历史都补齐，随后要求先提交 Octo。 | Octo 包级验证与提交；应用 wiki 脚本并执行历史回填。 |
| 2026-09-11 | v1 | completed | Octo 功能提交 `3c532d0`；wiki 取证脚本和规则已应用，1,856 份旧 raw 全部追加新版本，原文件哈希与线程内容逐一核验通过；复跑预览全部 unchanged。 | wiki/guide 改动未提交，用户只要求提交 Octo；未部署 Octo。 |

日期归一化将旧的无毫秒 ISO 统一为 `.000Z`，首次全量测试暴露已有断言差异；同步清洗测试已按新契约更新，全量复测通过。


历史回填统计：新版本 1,856 份，其中 Business line 非空 1,599 份、创建时间非空 1,856 份、解决方案非空 379 份；其余源字段明确为空。对应源记录缺失为 0。只回填已有 raw，不为尚未摄入的 Ticket 凭空生成线程证据；旧 wiki 页继续保留原证据引用。

源字段哈希独立是本次关键修正：旧流程只比较 prepared_messages 哈希，字段变化会被错误跳过。新版双哈希识别字段漂移；schema 保留原线程证据的版本边界。Skill 校验发现已有顶层 version 不在支持字段中，本次移至 metadata.version，不改变能力发现或调用策略。

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Octo 测试/构建 | 通过 | `pnpm --dir fe check`；14 项列表/视图测试；`pnpm --dir server test`：817 通过、1 跳过；`pnpm --dir server build`。 | 原生 Hermes 环境测试跳过；未部署。 |
| wiki 脚本单测 | 3 项通过 | `python3 -m unittest discover -s /home/deploy/projects/odoo-eu-guide/.agents/skills/write-support-qa/scripts -p test_ticket_snapshot_fields.py`；`bash -n` 通过。 | 覆盖字段形态/时间/脱敏/哈希、旧文件不可变、字段漂移和重复执行、重复身份失败。 |
| 真实取证入口 | 通过 | 使用只读 PostgreSQL，fetch 和 fetch-record 均返回归一化的三个字段、相同源字段哈希；中间原始字段已移除。 | 不输出业务 payload，无 Lark 或 LLM 调用。 |
| 历史回填及读回 | 通过 | 源元数据按 record_id 匹配全部 1,856 份旧 raw；逐一核对原文件哈希、旧正文、线程 sha256/snapshot_version/history_complete/source_updated_at 和新字段。重复预览 candidates=0。 | 同步数据来自本地快照；临时业务元数据文件验证后移除。 |
| Skill 校验 | 通过 | `skill-creator/scripts/quick_validate.py` 返回 Skill is valid。 | 修改范围为既有取证脚本、字段规范和历史新版本辅助脚本。 |

## 关联

- [字段核查](./2026-09-11-lark-ticket-field-display-audit.md)
