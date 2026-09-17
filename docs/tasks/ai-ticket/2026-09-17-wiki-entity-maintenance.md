---
title: "Wiki entities 批末联动与语义复核"
module: ai-ticket
status: done
requirement_version: 1
created_on: 2026-09-17
updated_on: 2026-09-17
closed_on: 2026-09-17
owner: TBD
related:
  - "./2026-09-11-ticket-source-fields-and-wiki-snapshots.md"
---

# Wiki entities 批末联动与语义复核

## 目标

落实用户确认的 SCHEMA 契约、write-support-qa 批处理收尾和变化/漏更校验。逐票取证、按簇写卡、每批统一复核受影响 entities；不回写 Lark/Octo Ticket，不自动认可历史知识。

## 验收标准

- [x] SCHEMA 定义实体内容、来源、更新触发、机械/语义维护边界和完成判定。
- [x] Skill 对单票及 10–15 票批次调用相同 plan/check 收尾；原/新对象都检查。
- [x] 标准库脚本生成关联区建议及待复核信息，检查原始来源新版本、lifecycle、概念变更和断链；不自动推进人工确认。
- [x] Octo Document 允许固定只读脚本；Answer、任意脚本/路径/写参数仍拒绝。
- [x] 回归覆盖批量去重、归属迁移、删除、来源变化、语义复核、幂等、非法元数据与路径；现库只读检查如实记录遗留问题。

## 背景与范围

知识库实际位于 `/home/deploy/projects/odoo-eu-guide/docs/llm-wiki` 子模块，Skill 位于 guide 仓库。两处已有用户未提交改动，须保留。Octo 改动仅涉及固定脚本的 ACP 终端授权及对应规则，不扩展业务写入。机制上线与历史 38 页全量内容复核是不同事项，本任务交付机制及存量检查结果，不伪造历史复核状态。

## 方案与决策

- plan/check 只读，确定性关联区作为建议交给 agent 通过现有文件工具写入；无需增加写脚本权限或新的状态账本。
- 复核指纹与说明保留在页面元数据，原始快照不可变，sources/生命周期变更会使复核失效。
- 工作流规则要求失败时报告部分完成；脚本不判断摘要语义正确，也不等于服务端强制完成门禁。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-17 | v1 | in_progress | 完成现有规则、Skill 和 ACP 权限检查；在临时目录准备外部仓库修改，避免覆盖已有工作。 | 实现和验证后应用到 guide/wiki。 |
| 2026-09-17 | v1 | done | SCHEMA、Skill v2.2.0、只读 plan/check、14 项 Python 回归已落入 guide/wiki；修复一处既有标题 YAML 转义，正文不变。Octo 固定命令授权通过 26 项定向测试与构建。 | 历史 38 页语义复核未执行；全量入口测试的既有失败已在 HEAD 基线复现；未部署。 |

## 提交记录

- wiki：`48e1c12`（规范、脚本、14 项测试和 YAML 格式修复）。
- guide：`f4aec01`（Skill 批末流程及 wiki 子模块引用）。
- Octo：本记录随权限接入和测试一起提交。
- 本次按修改片段暂存；SCHEMA/Skill/log 中此前的源字段、文档摄入、历史 raw 等改动保留在工作区。未推送、未部署。提交前对实际暂存的脚本重跑 14 项测试，并通过暂存 Skill 校验。

## 实际交付

- `/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/SCHEMA.md`：内容模板、关联/别名契约、来源与生命周期变化、复核指纹及完成边界。
- `/home/deploy/projects/odoo-eu-guide/.agents/skills/write-support-qa/SKILL.md`：单票/批量统一收尾；既有 Octo 单票取证权限不扩大。
- `/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/scripts/entity-maintenance.py`、`test_entity_maintenance.py`、既有 scripts README：标准库实现，无新增依赖；全库摘要与按实体详情，避免输出被 ACP 截断。
- Octo `acp-kimi-permission-policy.ts` 及测试、Server rules：只放行 Document 固定只读命令，文件写入走既有策略。原默认 Prompt 已要求遵循 Skill/SCHEMA，无需覆盖数据库或用户自定义 Prompt。
- wiki `log.md` 记录机制变更；库存数量卡仅修复标题 YAML 的内部引号转义。

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Python 单测 | 14 项通过 | 实际 wiki 路径执行 `python3 -B -m unittest discover -s /home/deploy/projects/odoo-eu-guide/docs/llm-wiki/scripts -p test_entity_maintenance.py`。 | 临时 fixture，含 CLI 退出码/只读性；不证明摘要语义正确。 |
| Skill / 差异静态检查 | 通过 | `quick_validate.py`；Octo、guide、wiki 的 `git diff --check`；7 个应用文件与暂存验证版本逐字节读回一致。 | 保留既有未提交改动；未提交 Git。 |
| Server 定向单测与 mock | 26 项通过 | `pnpm --dir server exec vitest run src/application/services/acp-kimi-permission-policy.test.ts src/application/services/acp-kimi-proxy.service.test.ts src/adapters/filesystem/wiki-knowledge-reader.test.ts`。 | 覆盖 Document 放行、Answer 拒绝、argv/路径/符号链接拒绝，以及既有代理/读取行为。 |
| Server 构建 | 通过 | `pnpm --dir server build`。首次暴露 executable resolver 字面量类型只接受 git，补充 python3 后通过。 | 未部署。 |
| Server 全量测试 | 967 通过、1 失败、1 跳过 | 首次误用 `pnpm --dir server test -- <path>` 实际运行全量；唯一失败是 `src/index.test.ts` 中 `expected '' to contain 'ENTRY_LOG_LEVEL=debug'`。 | 已在临时 `git archive HEAD server` 的未修改基线重现同一失败（该文件 3 通过/1 失败）；不归因于本次修改。原生 Hermes 测试跳过。 |
| 真实现库只读检查 | plan 0；check 1（待办） | 80 concepts、38 entities；解析错误 0；38 页尚未迁移新关联区/必填节/语义复核；4 个对象候选。全库 JSON 25,671 字节；sale.order 详情 33,675 字节，均低于 ACP 256 KiB 上限。 | check 非 0 如实反映历史待办，不是全库知识已更新。94 条 evidence_needs_review 为实体-卡关系，不能当作 94 张独立卡。 |
| 真实批量摄入 / live ACP / 部署 | 未执行 | 本轮未访问 DB 或外部平台，未重跑 Ticket 蒸馏。 | 新 Skill 和脚本已落在本地 guide/wiki；Server 权限代码需部署后生效。 |

## 后续边界

- 旧实体页应在各自问题簇更新或专项存量复核时逐页迁移，不能批量复制指纹冒充语义审阅。
- 手工改卡后可直接运行全库 check；未增加 CI、定时任务或 Server 强制完成门禁。
- 新实体候选含真实模型与潜在别名（hr.department、product.pricelist、res.partner / Contacts、销售订单），必须先核实别名，不自动建四个页面。
- 已复核本轮近失误；定向 Vitest 参数错误已有 ERR-20260814-001，追加本任务链接，不新增重复规则。YAML 解析/静默漏关联已由本次回归测试兜底。
