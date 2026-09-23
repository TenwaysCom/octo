---
title: "历史 Finish Ticket skip 重评"
module: ai-ticket
status: in_progress
requirement_version: 1
created_on: 2026-09-22
updated_on: 2026-09-23
closed_on: null
owner: TBD
related:
  - "./2026-09-22-wiki-ingestion-audit.md"
---

# 历史 Finish Ticket skip 重评

## 目标与范围

按用户确认的新口径重评核查快照中 1312 张历史 skip 的 Finish Ticket；类型不直接决定 skip，无匹配卡不是不沉淀理由。保留原始 raw 和历史判定，分开证据摄入、知识处理、人工审核；更新 wiki 与权威账本。不部署、不修改 Octo 业务同步、不向 Lark/Octo 回写。

本记录中的“历史 issue”指这批 Lark Ticket 的知识摄入欠账，不代表业务问题需要重新打开。2026-09-22 文档整理只核对本地账本和已有队列，未执行下一批摄入或重新查询 Lark/数据库。

## 接手摘要（2026-09-23 账本复核）

**状态仍为 `in_progress`。** 按原始 1312 张队列的 `record_id` 关联当前权威账本，1060 张标记为 `source_reviewed`，252 张仍为 `triaged`。原“剩余 1300 张”及 11/621/334/334 分组是首轮快照，已被后续批次推进取代。

| 原始 1312 张的当前分组（互不重叠） | 数量 | 处理边界 |
| --- | ---: | --- |
| source_reviewed / draft | 1049 | 账本已登记原文复核，知识仍为草稿，不等于人工审核通过 |
| source_reviewed / historical_case | 7 | 已登记历史案例 |
| source_reviewed / no_distill | 4 | 已登记无需进一步提炼 |
| triaged / needs_evidence | 127 | 待补证及原文复核 |
| triaged / on_hold | 123 | 已暂缓/分流，不能计为原文复核完成 |
| triaged / no_distill | 2 | 273、819 的处置与复核标记不一致，需核对依据后决定是否更正 |

本次只核对账本状态，没有逐票重读原文或确认批量处置质量。当前 `content-first-v1` 共 1408 条，已超过本任务原始范围，因此不能仅按规则版本统计 1312 张目标；必须与[原始队列](/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/queries/2026-09-22-historical-skip-review-queue.csv)按 record_id 取交集。

[09-23 批次计划](/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/queries/2026-09-23-remaining-batch-plan.md)写有“计划完成/无 pending_review”，表示该计划的分流已结束，不能替代本任务的逐票原文复核验收。原缺完整聊天 46 张是历史分组，本次未重新核实缺失原因。

## 验收标准

- [x] 1312 张目标身份与证据逐条可追溯，保留原判定。
- [ ] 依据内容区分知识提炼、案例保留、待补证据和无需进一步提炼；不得以分类标签机械重判或把未复核项标为完成。
- [x] 1646、2008、2041 按已回读原文的结果落地，其他票保留明确的处理边界。
- [x] 本批知识未经人工签核，更新 index/log/账本；前后 plan 确认无受影响实体，既有实体欠账如实记录。
- [x] 不修改既有 raw、不覆盖其他未提交改动，验证幂等和关联完整性。

## 方案与决策

依据用户授权采用内容导向规则，覆盖 Skill 中旧的按类型 skip 规则。执行前记录 wiki 当前文件基线和 entity plan，写入前用 SHA-256 检查并发修改。数据库新鲜度与本轮历史证据复核分别表达；不将 9 月 16 日之前同步的材料宣称为当前源端状态。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-22 | v1 | in_progress | 已读取 guide/Skill/schema；wiki 存在用户 staged 与 unstaged 改动，开始记录基线。 | 完成证据集合与逐票重评。 |
| 2026-09-22 | v1 | in_progress | 1312 条已重开、保留旧行与快照指纹；原文复核 12 张，7 张补入两页 FAQ、4 张保留有边界的历史案例、2041 无需进一步提炼；另修复 11 张已有知识引用。 | 原文复核尚余 1300 张：11 张只修复关联，1289 张仅初筛。未宣称全批摄入完成。 |
| 2026-09-22 | v1 | in_progress | SCHEMA 与 write-support-qa v2.2.1 删除按类型/无匹配卡 skip，账本区分原文保存、初筛、引用修复、原文复核与人工签核。 | 未实现周期任务、增量同步或 Lark thread freshness；其他 175 条非目标 skipped 保留。 |
| 2026-09-22 | v1 | in_progress | 整理交接:读回账本确认 12/11/1289 阶段分布;与旧 90 张队列按 record_id 交叉核对,重叠 13 张,均未完成原文复核。补齐处理顺序、脚本入口和后续开发边界。 | 本次仅更新任务文档,没有继续摄入或修改业务代码。 |
| 2026-09-22 | v1 | in_progress | 执行第一步「重算候选」:从当前 `_meta/state.jsonl` 重算 content-first-v1 且非 source_reviewed 共 1300 张(triaged 1289 / reference_checked 11),与旧 90 张队列按 record_id 合并:交集 13、并集 1377,与交接数字一致。合并清单落盘 [candidates-recomputed.csv](/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/queries/2026-09-22-historical-skip-candidates-recomputed.csv)。发现旧 90 张队列中 34 张(18 新增摄入、16 补账本登记)不在当前账本,已在合并清单带 `queue_*` 字段保留。 | 清单是派生快照,状态权威仍为 state.jsonl。 |
| 2026-09-22 | v1 | in_progress | 执行第二步:11 张 reference_checked 全部完成原文复核。4 张源字段漂移(1781/1795/1805/1806)先追加 2026-09-22 版本 raw(哈希与 DB 核对一致、supersedes 链完整、幂等);6 张维持引用(1552/1611/1612/1781/1806/1815);1615 修正 pricelist 卡 5%/7% 价目表归属,1750 补 FAQ「置空再重填」细节;1795/1805/1824 三张卡重写(旧卡归档):1795 新卡补 US Odoo 18 缺 Return Location 字段事实、1805 改写为 TB 导出历史案例、1824 重写为 ensure_one 历史案例(根因未记录,confidence low)。受影响 4 实体关联更新,check 0 错误。账本 11 张已置 source_reviewed(含 3 张 historical_case),剩余待原文复核 1289 张。证据:queries/2026-09-22-reference-checked-source-review.md。 | 1795/1805/1824 卡 draft 待人工抽查提 confirmed。 |
| 2026-09-22 | v1 | in_progress | 结构性候选处理完成:①1611+1612 两张单票卡合并为 concepts/after_sales/contacts-owl-error-cannot-open-historical-case.md(旧卡归档,index 两行合一,账本 qa_card_path 已更新);②新建实体页 entities/objects/stock-picking-type.md(lifecycle 基线 52dd7fa,managed_block 按脚本建议写入,index 注册)。全库建页候选由 5 组降为 3 组(hr.department、product.pricelist、销售订单);check 新实体及相关页 0 错误。 | 新实体页与合并卡的语义级复核归入实体维护任务的全库 39 页欠账;3 组存量建页候选仍待处置。 |
| 2026-09-22 | v1 | in_progress | 执行第三步首簇(621 候选):integration_sync 子群 43 张分流为 6 个子簇,首簇「Shopify SKU 映射/生命周期」4 张(422/487/924/1675)逐票回读原文确认同模式后建卡 concepts/integration/shopify-order-sku-mismatch-mapping-and-lifecycle.md——映射指向旧产品致 SKU 回退(422/487)、同变体双映射(1675)、SKU 生命周期两类场景及 confirm 前/后边界、开卖前双端确认建议(924);confidence medium(draft)。shopify/product.product/sale.order 三实体补关联。账本 4 张置 source_reviewed/draft。 | 4 张卡 draft 待人工抽查;映射清理与场景二长期方案在源端未闭环,卡内已如实记录。 |
| 2026-09-22 | v1 | in_progress | Shopify 同步缺失子簇 10 张(301/303/334/500/705/1002/1024/1383/1816/2086)逐票回读原文后归入新 FAQ concepts/faq/shopify-order-not-synced-checklist.md:五类原因分流(SKU 不存在→映射卡、Shopify 暂停、定时拉取约 1 小时、财务配置/流水断更、导入报错已修复)。与 924 场景一互证完成。账本 10 张置 source_reviewed,待原文复核余 1275;integration_sync 子群 43 张已处理 14 张。 | FAQ/卡均 draft 待人工抽查;余 tracking 回传、WMS 状态/发送、银行流水等子簇待后续批次。 |
| 2026-09-22 | v1 | in_progress | tracking 回传子簇 4 张(1468/1844/1513/2087)逐票回读原文后归入新 FAQ concepts/faq/tracking-number-wms-status-callback-checklist.md:回传时点规则(Westerman finished/Booked 才主动回传;Burger/CMC 拣货即回传属特殊要求)、偶发漏回传手工 Update in Marketplace、对方操作失误/接口故障三类;与既有 WMS 推送卡、WMS TO SEND FAQ 互链。账本 4 张置 source_reviewed,待原文复核余 1271;integration_sync 已处理 18/43(1 卡+2 FAQ)。 | FAQ draft 待人工抽查;余 WMS 状态/发送(8)、银行流水(2)、其他(15)子簇待后续批次。 |
| 2026-09-22 | v1 | in_progress | WMS 状态/发送子簇 8 张(609/934/1351/1452/1518/1566/1579/1809)逐票回读原文后归入新 FAQ concepts/faq/outbound-send-queue-and-error-checklist.md:队列约 1 分钟一轮+立即执行、发送成功但对方未收(慢处理/切换窗口/手动重推)、电话前缀与 B2B Company 为空致批量 error、两类已修复 bug(队列权限、运费缺失);与 WMS 推送卡分工互链。账本 8 张置 source_reviewed,待原文复核余 1263;integration_sync 已处理 26/43(1 卡+3 FAQ)。 | FAQ draft 待人工抽查;余银行流水(2)、其他(15)子簇待后续批次。 |
| 2026-09-22 | v1 | in_progress | integration_sync 子群收尾:银行流水 2 张(920/1447)归入 Shopify 同步 FAQ;其他 15 张分流——10 张归入新 FAQ external-transfer-misc-checklist.md(GLN、供应商编码、CN 发送日期限制、street2 并 street1、scheduled task、名单同步、Sales Team、UK 附件校验、分录恢复),213 扩展既有 WMS TO SEND 卡(sources+补充证据节),338/756/1177 逐票写明理由置 no_distill(一次性操作/已修复单点 bug)。子群 43 张全部完成:1 卡+4 FAQ+1 卡扩展+3 no_distill。账本 +16,待原文复核余 1247。 | 各 FAQ/卡 draft 待人工抽查;杂项 FAQ 各条为单票孤证(confidence low),同类复发凑满两票应升级正式卡。 |
| 2026-09-22 | v1 | in_progress | config_change 子群(86 张)启动,首簇财务科目调整 7 张(304/416/418/419/402/372/437)逐票回读原文后扩展既有「科目配置与报表映射」卡:新增类型 5「科目编码/归类调整」节——报表分组归类、改码入 Online MKT、分类纠正、补建 GL99999/ADJE、PL 不平追因;共性路径含 418 教训(单站点改码必须同步其余站点)。sources/source_tickets/updated 均更新,链接校验通过。账本 7 张置 source_reviewed,待原文复核余 1240。 | 卡 draft 待人工抽查;config_change 余 79 张待续(审批流调整、仓库/库位新建、财务报表调整等次簇)。 |
| 2026-09-22 | v1 | in_progress | config_change 次簇:审批流调整 6 张(349/351/446/448/471/511)逐票回读原文后归入新 FAQ approval-flow-config-change-checklist.md——流程定义先行、测试→正式→多站点、旧单不追溯+Responsible 口径、条件保存后真实新单验收(351 教训)、审批人角色来源清点(511)。账本 6 张置 source_reviewed,待原文复核余 1234;config_change 已处理 13/86。 | FAQ draft 待人工抽查;config_change 余 73 张(仓库/库位新建、财务报表调整等次簇)待续。 |
| 2026-09-22 | v1 | in_progress | config_change 次簇:仓库/库位/Operation Type 新建 4 张(473/496/522/628)逐票回读原文后归入新 FAQ warehouse-location-operation-type-setup.md——Other 类型不能随意新建、直发单独建仓不混实体仓、虚拟调整仓 INVEN/Stock 口径(负库存/仅内部移库/设负责人)、UK 按类型决定发指令+审批流改动旧单不追溯。账本 4 张置 source_reviewed,待原文复核余 1230;config_change 已处理 17/86。 | FAQ draft 待人工抽查;config_change 余 69 张待续。 |
| 2026-09-22 | v1 | in_progress | config_change 次簇:Contact 标签/主数据变更 8 张(474/1034/1260/1414/1535/1656/1709/2040)逐票回读原文后归入新 FAQ contact-tag-and-master-data-change.md——tag 由 IT 创建且申请须说明定义(层级命名)、变更须通知业务、字段删除分视图/field 两层、识别 tag 可替代字段、主数据修正只影响新数据。账本 8 张置 source_reviewed,待原文复核余 1222;config_change 已处理 25/86。 | FAQ draft 待人工抽查;config_change 余 61 张待续。 |
| 2026-09-22 | v1 | in_progress | config_change 次簇:邮件模板/通知 6 张(535/559/856/1275/1520/2102)归入新 FAQ email-template-notification-config.md——触发点+收件对象、多语言同步、代码覆盖模板须锁模板(1275 关键教训)、审批提交通知可配置。账本 6 张置 source_reviewed,待原文复核余 1216。 |
| 2026-09-22 | v1 | in_progress | config_change 次簇:会计科目/凭证字段/报表配置 15 张(613/771/788/892/1173/1307/1385/631/456/858/791/371/918/948/1014)逐票回读原文后归入新 FAQ accounting-config-adjustments-checklist.md(逐条处置表):CN 必填 bug、12010 预付款科目、Asset 字段分批上线、999999 特殊科目取数原理、department 字段+请款部门数据、毛利表负数逻辑、21010 补设、SEPA Batch Booking、旧 GL 不批量切换(维持现状)、US 报废按类型定科目 46001 等。账本 15 张置 source_reviewed,待原文复核余 1201;config_change 已处理 46/86。 | FAQ draft 待人工抽查;config_change 余 40 张待续。 |
| 2026-09-22 | v1 | in_progress | config_change 次簇:权限与流程口径调整 12 张(454/573/868/1466/1565/1658/1718/1849/1851/2026/2058/2062)逐票回读原文后归入新 FAQ permission-and-process-adjustment-checklist.md——cancel 角色收紧、Reset to Draft 生效条件、字段放出界面边界、必填取消范围精确到场景、US 审批范围差异、审批即 Done、负库存关闭与误配仓位清理、默认值不可设(系统无法区分场景)、定时权限。账本 12 张置 source_reviewed,待原文复核余 1189;config_change 已处理 58/86。 | FAQ draft 待人工抽查;config_change 余 28 张(多为需求/feature 类)待续。 |
| 2026-09-22 | v1 | in_progress | config_change 收尾:剩余 28 张逐票回读原文后归入新 FAQ config-change-remainder-checklist.md(逐条处置表):SO 默认出库仓、delivery address 排序逻辑、其他入库附件、审批仅 AP+清理离职账号、运费配置、UK Sales report、签名去水印、预订单邮件转 feature、折扣审批登记 bug、需求流程转排期等;跨票规则:需求转办带业务方验收(352)、配置错改当日回滚(744)。config_change 子群 86 张全部完成(triaged+pending_review 清零),账本 +28,待原文复核余 1161。 | 处置表 FAQ confidence low(draft),待人工抽查;621 池余 data_maintenance(113)、grant_permission(73)、product_info_maintenance(69)、workflow_stuck(70)等子群待续。 |
| 2026-09-22 | v1 | in_progress | 按用户口径新增 5 个 process 配置聚合页:concepts/{inventory,delivery,integration,accounting,sales}/ respective *-config-checklist.md,每页固定「适用场景/配置项清单(链接回规则页)/Support 检查项/QA 回归项」,规则正文留在原 FAQ 只导航不复制;index 各 process 节注册(Concepts 96),链接校验通过。 | 聚合页覆盖现有 FAQ/卡;后续新 FAQ 落地时同步更新对应 process 聚合页。聚合页 draft 待人工抽查。 |
| 2026-09-22 | v1 | in_progress | data_maintenance 子群(113 张)按用户意见补做子簇精读:四分类重排(单据状态变更 35/主数据 20/导出操作 57/业务口径 1),补读约 24 张有 solution 的票,提炼「单据状态变更共性口径」(cancelled 可恢复、done 后后台改、预算恢复可再触发等)与「跨表规则 7 条」(Draft 直接改/post 走 CN 冲销、一步退货到 stock 属错误操作、重复公司设 parent/subsidiary、折旧 journal 归一、审计导出先确认站点数据可得性、Preorder 仅 25-10 后数据),更新 data-maintenance-disposition-checklist.md。纯导出操作 57 张维持分流表处置。 | 分流表+补读规则 draft 待人工抽查;剩余子群(grant_permission 80、workflow_stuck 100、enhancement 77、data_inconsistency 77、business_rule 55、usage_guidance 49、product_info_maintenance 73 等)处理时直接采用「分类→精读有 solution 票→分流表/卡」模式。 |
| 2026-09-23 | v1 | in_progress | 只读核对当前 state.jsonl（1936 个唯一 record_id），按原始队列锁定 1312 张：source_reviewed 1060 / triaged 252；知识分组见接手摘要。原 11 张 reference_checked 已全部完成登记复核；原 90 张队列的 13 张交集均为 source_reviewed。更新摘要、执行顺序与索引。 | 不把 draft/on_hold/no_distill 标签或“计划完成”当成人工审核/原文复核证据；未执行新摄入、源端同步或账本修改。 |

## 产物与继续处理

- [逐票复核表](/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/queries/2026-09-22-historical-skip-review-queue.csv)：1312 条，包含旧理由、新阶段、下一步与证据路径；这是当次导出，状态权威仍为 wiki `_meta/state.jsonl`。
- [复核结果](/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/queries/2026-09-22-historical-skip-review.md)与[历史案例](/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/queries/2026-09-22-historical-configuration-case-review.md)。
- 首批已回读原文：507、553、575、985、1181、1182、1304、1498、1646、1939、2008、2041。没有调用外部模型；初筛依赖既有分析及关键词，不冒充逐票原文复核。
- 首批 1289 张初筛的 621/334/334 分流仅为历史记录。当前候选按原始 1312 张 record_id 与权威账本关联，再筛 `review_status != source_reviewed`；当前数量见接手摘要。
- 2008 已记录 Done 节点调整；财务通知未实测、库存纠错仍有争议。1646 保留二手 SKU 排查线索，创建标准与环境未知；2041 原文只有单笔地址与订单正常性确认，因此不提炼。

## 下一步执行顺序

1. **重算候选，固定原始范围。** 按原始 1312 张队列的 record_id 关联当前账本；原 11 张关联复核已完成，无需再次作为首批待办。旧 621 张等主题分组不再作为当前余额。
2. **核对两张状态不一致记录。** 273、819 已为 no_distill 但仍为 triaged；检查原文和处置理由，不能只为了清零而更改 review_status。
3. **处理 127 张待补证。** 逐票明确缺少的聊天、处理结果或其他证据，补齐后复核；无法补齐时保留具体缺项及重试条件。
4. **复核 123 张 on_hold 的边界。** 确认暂缓原因、后续承接任务和是否实际完成原文复核；分流到需求处理不能自动视为本任务验收通过。
5. **每批更新知识与证据。** 保留原决定，更新同一条账本及知识关联；有 concept/raw 变化时运行实体 plan 并复核受影响实体。草稿仍需人工审核，不自动提升 confirmed。

开始下一批前必须读 [SCHEMA](/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/SCHEMA.md) 与 [write-support-qa](/home/deploy/projects/odoo-eu-guide/.agents/skills/write-support-qa/SKILL.md)。可复用入口如下，**不是一键批量摄入脚本**：

| 工作 | 已核实存在的入口 | 边界 |
| --- | --- | --- |
| 单票 DB 取证 | [octo-ticket-evidence.sh](/home/deploy/projects/odoo-eu-guide/.agents/skills/write-support-qa/scripts/octo-ticket-evidence.sh) 的 `fetch <ticket_no> --json` / `fetch-record <record_id>` | 读取本地 DB，不证明源端最新；不输出完整业务 payload 到任务记录 |
| 源字段版本追加 | [ticket-snapshot-fields.py](/home/deploy/projects/odoo-eu-guide/.agents/skills/write-support-qa/scripts/ticket-snapshot-fields.py) | 属于 Skill 的 scripts 目录；先预览，只处理源字段，不代替聊天抓取或知识复核 |
| 实体影响与检查 | [entity-maintenance.py](/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/scripts/entity-maintenance.py) 的 `plan --json` / `check --entity … --json` | 只读检查；本批通过不等于全库通过 |

## 与原 90 张队列的关系

[原核查任务](2026-09-22-wiki-ingestion-audit.md)的 90 张覆盖新增 raw、源字段变化和账本修复，不覆盖全部历史 skip。与本任务重叠的 13 张为：1636、1688、1729、1730、1751、1781、1795、1805、1806、1846、1863、1892、1904。

2026-09-23 按当前账本复核：原 90 张均已有账本行，82 张 source_reviewed（73 draft、2 historical_case、7 no_distill），8 张 triaged / needs_evidence。与原始 1312 张重叠的 13 张已全部 source_reviewed（11 draft、2 historical_case），不再属于原文复核余额。

按 review_status 口径，本任务剩余 252 张与旧队列剩余 8 张无交集，合计 260 张；这不是全库待办数，也不证明旧 90 张的字段漂移和路径修复逐项验收完成。旧 CSV 的“处理结果/完成时间”仍为空，保留为核查快照；原 1377 并集不再用作当前余额。

## 后续独立工作（尚未实施）

| 工作 | 为什么需要 | 完成条件 |
| --- | --- | --- |
| 原 90 张队列验收衔接 | 当前 82 张已登记原文复核、8 张待补证；旧事项级验收未重新验证 | 待补证票号及边界见[核查任务](2026-09-22-wiki-ingestion-audit.md)；逐项核对字段/路径事项，不用知识状态替代验收 |
| wiki 增量摄入与线程新鲜度 | 当前规则/账本已调整，运行时自动机制尚未开发 | 初次全量对账后，日常选源字段变化、线程检查到期、规则变更及待办/失败重试；按成功检查结果推进状态，周期性全量校验漏项 |
| 终态线程复查 | 当前 `ensure` 对终态且完整可用的快照直接返回 cache | 区分快照完整与当前最新；补充可验证的到期/强制复查机制，失败不标成功，覆盖终态之后新增/编辑/删除消息等场景 |
| 历史一致性问题 | 136 份 raw YAML 问题、哈希清洗口径差异、1556 张 Finish stale 标记仍需判断 | 保留 raw 原件；分清格式变化与真实消息更新；验证 stale 原因后再解释数据，不能推断已删除 |
| 实体存量复核 | 首批记录为 38 页待复核及 4 组建页候选，当前数量本次未重跑 | 按[实体维护任务](2026-09-17-wiki-entity-maintenance.md)逐页处理，不以本批无新增影响代替全库完成 |

终态缓存判断入口：[decideLarkTicketThreadSync](../../../server/src/application/services/lark-ticket-thread-context.service.ts)。现有平台增量 Worker 不等于 wiki 增量摄入已接通；上述运行时工作只记录为后续范围，不在本次文档整理中修改代码或创建定时任务。

## 完成与暂停标准

- 本任务保持 `in_progress`，不能因 1312 条都写了新状态就关闭。剩余每票需要原文复核及可追溯的最终知识处置；缺证据项有具体待补事项，不能伪造完成。
- 每批失败可从逐票账本恢复；同规则版本、同文件指纹但仍为 triaged/reference_checked/needs_evidence 的票不能跳过。
- 当前 1060 张 source_reviewed 是账本登记状态；本次未重新检查每张原文，不代表当前源端无变化或人工已签核。证据/规则变化仍需重新判断。
- 此次整理未修改业务范围，`requirement_version` 保持 v1；后续实际新增运行时机制时另按需求变更流程建档或关联实现任务。

## 验证

首轮历史静态验证已通过：1840 条账本唯一性，1312 条旧决定完整保留，528 条非目标行字节不变，38 处页面链接检查，3712 份 Ticket raw 及 2 份文档 raw 文件哈希不变。所有 wiki 非目标内容文件保持基线，未覆盖原有未提交内容。发现编辑器临时文件 `_meta/.state.jsonl.swp` 在执行期间变化，未读取内容或修改它；账本正文与写入清单一致。写入 11 个文件（wiki 10、Skill 1），重复应用写入 0 文件。

Skill quick_validate、wiki/Skill `git diff --check` 通过。实体全库 `check --json` 退出 1：与批前结果完全一致，38 页待复核、4 组建页候选；38 个指纹均未变，本批没有新增实体影响，不能称全库 check 通过。

[校验摘要](/home/deploy/.codex/visualizations/2026/09/17/01a0ae12-6507-7642-b98c-f6fe49dfb989/historical-skip-reprocess-20260922/verification-final.json)。只修改知识文档及元数据，未跑应用单测、mock/live E2E 或部署验证；没有刷新 Lark、没有业务回写，没有提升 confirmed。

2026-09-22 交接整理验证：读回本地 state 并与原队列按 record_id 比较，确认剩余 1300、交集 13、候选并集 1377；检查本次三份任务/索引文档的文件链接及 diff。修正索引里一条不存在的 WeKnora 任务链接为“原记录缺失、状态待核实”，未用位置调整任务替代它。此次未改 wiki/账本、运行时或全局 agent 规则，无需应用测试。

2026-09-23 状态更新验证：当前账本 SHA-256 为 `cfaf8f89ba95827d126a5e495ce96f3f834bd4351f355c853d0e48adefb48ace`，1936 行且 record_id 唯一；原队列 1312/1312、旧队列 90/90 均能关联。当前全账本 needs_evidence=172、on_hold=251；09-23 导出分别为 138、228，已不是实时待办（needs_evidence 导出有 11 张已转出，另有 45 张新增；on_hold 新增 23 张）。仅更新本项目任务文档，未修改外部 wiki、导出或账本，未查询 DB/Lark，未运行应用测试。

## 风险与复核边界

旧分析里的 resolved/pending、主题关键词只能帮助分流，不足以重判知识价值。此次保留 triaged/reference_checked/source_reviewed 区分，防止批处理把初筛或已有引用误记为摄入完成；规则已写入 SCHEMA，未在 Learning Ledger 重复建立权威规则。任务仍为 in_progress，剩余原文复核不得因规则版本/快照指纹相同而跳过。
