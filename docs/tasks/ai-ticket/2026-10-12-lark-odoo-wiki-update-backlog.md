---
title: "本地 Lark Odoo Wiki 原始文档更新清单"
module: ai-ticket
status: done
requirement_version: 1
created_on: 2026-10-12
updated_on: 2026-10-12
closed_on: 2026-10-12
owner: TBD
related:
  - "./2026-10-12-wiki-update-production-audit.md"
---

# 本地 Lark Odoo Wiki 原始文档更新清单

## 目标与范围

用户已明确本轮对象为同步到 `/home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki` 的飞书 Wiki 原始文档。盘点全部页面，复核重点正文及已有领域分析，交付按页面定位、带优先级和完成条件的更新清单。本轮整理清单，不更新飞书、不刷新导出、不修改 Odoo 代码或生产配置。

## 验收标准

- [x] 核对本地导出时间、节点类型和文本覆盖范围。
- [x] 区分原文明确缺项、跨页口径待统一、需要业务确认的候选项。
- [x] 每项列出目标页面、应改内容、依据与完成条件；不把静态分析写成生产事实。
- [x] 检查本地引用和差异，记录未覆盖的验证。

## 方案与决策

以用户指定的本地快照为依据，页面正文及明确 TODO 优先，Ontology 提供差异线索；其 draft、拟议及未验证内容不直接覆盖飞书业务规则。全部节点做机械盘点，重点页面做正文复核，不宣称 115 页已完成逐条语义审计。原始导出与其他仓库已有改动保持原样，清单统一维护在本任务。

## 范围基线

- 本地 INDEX 与 `.lark-wiki-export.json` 的导出时间均为 **2026-09-25 18:28:42（UTC+8）**。
- 117 个节点：115 个 docx 文本页面、1 个 bitable（Support Content Bank，xlsx）、1 个 Pre-order 视频文件。另有导出用 INDEX.md；不能把 116 个 Markdown 文件误报为 116 篇业务文档。
- manifest 的 `current` 是当次导出状态，不证明 2026-10-12 飞书线上最新。未联网获取新修订号、未审阅 xlsx/video 内容、未验证外链图片可用性。

## 内容更新清单

**本轮整理 20 个更新专题，涉及 37 个去重目标页面：P1 12 项、P2 7 项、P3 1 项。** 优先级按操作结果、库存／财务影响及权限解释风险提出，属于建议处理顺序，不是线上故障等级。

- **原文明确信息缺失**：空白场景表、TODO、只有问题提纲、同页正文／表格差异，可以明确列为待补文档。
- **跨页版本口径待统一**：确认各页环境和生效版本后再统一；后台与 Portal 的不同表现不自动构成矛盾。
- **业务／实现待确认**：阈值、信用占用、权限和估值需业务维护方确认，已有 Ontology 的静态分析只提供核验线索。

建议第一批按 **W07（月结校验）→ W05（其他入库）→ W09（退款）→ W02（状态）→ W01（补发／退货）** 推进，其余按同域承接。

### P1：优先更新

#### W01 · 销售改单、补发与退货

- 页面：[SO 以及发货](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Sales/SO 以及发货.md>)。
- 类型：原文明确信息缺失。
- 更新内容：补齐空白场景表、Resell、同 SKU 补发、换 SKU、两步退货、借用出入库；明确各场景来源单据、WMS/发票状态、处理角色及完成结果。线上可改原 SO／线下须新建 SO 的适用范围需确认。
- 完成条件：每个场景都有适用前提、操作入口、责任角色、结果检查和例外处理；政策由销售与仓库确认。
- 建议维护角色：Sales Ops／仓库／IT（未分配具体负责人）。
- 补充依据：[sales-order-amendment](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/sales-order-amendment.md:121>)；保留其原有草稿／未验证边界。

#### W02 · 预订单、销售欠单及 Portal 状态

- 页面：[【Internal】Pre-order, Sales Order & Backorder Status Flo-RZMQwSB4](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Sales/【Internal】Pre-order, Sales Order & Backorder Status Flo-RZMQwSB4.md>)；[【Dealer Guide】“Pre Orders” New Page_ Overview & Details](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Dealer Portal/【Dealer Guide】“Pre Orders” New Page_ Overview & Details.md>)。
- 类型：跨页版本口径待统一。
- 更新内容：明确 Done 表示需求已转单，与 SO 确认、发货、开票分别判断；对齐 Closed／Cancel／Cancelled 的历史与现行用法、Portal 展示、Remaining/Closed Qty；补有效期当天、重开、删除已转单明细后的追溯边界。
- 完成条件：后台与 Portal 各有当前适用的状态表和数量例子；有效期当天和关闭/重开规则确认，保留旧版本适用期。
- 建议维护角色：Sales Ops／Portal 产品／IT（未分配具体负责人）。
- 补充依据：[preorder-backorder](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/preorder-backorder.md:284>)；保留其原有草稿／未验证边界。

#### W04 · 库存字段及可售库存

- 页面：[库存逻辑](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Inventory/库存逻辑.md>)；[Odoo 库存字段](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo系统功能梳理/Odoo 库存字段.md>)。
- 类型：跨页口径与配置范围待确认。
- 更新内容：将后台所选仓库 free_qty、Portal tw_free_qty、可承诺量、WMS 数量和拆分可用量分开；复核旧“四仓汇总”适用日期、排除仓/库位、子库位、缺货开关及品类例外；补公司/渠道、单位和刷新口径。
- 完成条件：同一脱敏样例能解释各入口数量不同的原因，当前纳入仓库和例外配置由维护方确认。
- 建议维护角色：仓库／Sales Ops／IT（未分配具体负责人）。
- 补充依据：[sales-available-inventory](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/sales-available-inventory.md:133>)；保留其原有草稿／未验证边界。

#### W05 · 其他入库估值与审批

- 页面：[其他入库 Other Inbound](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Inventory/其他入库 Other Inbound.md>)；[US其他入库 Other Inbound](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Inventory/US其他入库 Other Inbound.md>)。
- 类型：同页正文与汇总表存在差异。
- 更新内容：统一四种场景的零价值／最新平均成本、科目及来源库位；重点核对赠送物料“入库价值为0”与 current cost 分录，以及 UNKNOWN 退回车正文与表格科目差异；确认各场景谁 Validate、财务抄送还是审批，EU 与 US 分开。
- 完成条件：财务签署逐场景估值/分录表，仓库确认执行与审批角色；正文、表格、示例一致。
- 建议维护角色：财务／仓库／IT（未分配具体负责人）。
- 补充依据：[warehouse-operation](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/warehouse-operation.md:191>)；保留其原有草稿／未验证边界。

#### W06 · 未完成调拨单完成与日期调整

- 页面：[调整Unfished Outbound的status以及date](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Inventory/调整Unfished Outbound的status以及date.md>)。
- 类型：操作说明缺少适用和收尾条件。
- 更新内容：在 ready/waiting→done、negative check、开启 Validate 及 Adjust Date 步骤前补真实仓库结果核对、操作角色、允许期间、审批条件；说明库存与会计日期影响、锁期及调整后核对，不将其写成通用绕过流程。
- 完成条件：明确可执行场景、禁止/升级场景、批准角色及库存/财务核对项，历史修补与日常 SOP 分开。
- 建议维护角色：仓库／财务／IT（未分配具体负责人）。
- 补充依据：[warehouse-operation](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/warehouse-operation.md:194>)；保留其原有草稿／未验证边界。

#### W07 · Journal Entry 必填字段与复核

- 页面：[【月结】必填字段以及复核](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Accounting/【月结】必填字段以及复核.md>)；[【月结】Journal Entry 动态字段检查补齐需求](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Accounting/【月结】Journal Entry 动态字段检查补齐需求.md>)；[Journal Entry 必填校验逻辑](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo系统功能梳理/Journal Entry 必填校验逻辑.md>)。
- 类型：跨页状态差异及明确 TODO。
- 更新内容：对齐“事先检查还没上线”与需求页已勾选前校验/后校验的适用版本；用创建/保存/Post/Review/反审核/关账矩阵说明必填、附件、自动补齐和阻断；收拢反审核、改行清复核、reference/label、历史/未来分录与 write-off 待办。
- 完成条件：按公司、凭证来源及操作时点给出已上线/未上线/历史修补状态，财务确认复核失效和关账条件；TODO 有结论或责任/恢复条件。
- 建议维护角色：财务／IT（未分配具体负责人）。
- 补充依据：[journal-item-control](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/journal-item-control.md:161>)；保留其原有草稿／未验证边界。

#### W08 · 月结成本、两步退货与历史对账修复

- 页面：[【月结】平均成本月结](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Accounting/【月结】平均成本月结.md>)；[财务对账不平文档](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Accounting/财务对账不平文档.md>)。
- 类型：明确 TODO 与历史修复边界不清。
- 更新内容：确认已勾选但仍标 TODO 的 CN/Invoice 成本一致性；补退货到 stock/loss 的分录表缺项、跨月/在途/成本/报表核对及完成标准；将含固定记录 ID 的 SQL、旧数据修补与正式业务 SOP 分开，保留日期和适用范围。
- 完成条件：月结前后检查与差异处理可执行；财务确认分录和成本口径，历史修补有证据范围及结果，不保留未知状态的已完成标记。
- 建议维护角色：财务／仓库／IT（未分配具体负责人）。
- 补充依据：[journal-item-control](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/journal-item-control.md:163>)；保留其原有草稿／未验证边界。

#### W09 · 退款补偿阈值及结果

- 页面：[Refund Function Operation Manual 用户操作手册](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Sales/Refund Function Operation Manual 用户操作手册.md>)；[Studio Access／Approve](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Admin 操作/Studio Access／Approve.md>)。
- 类型：业务说明与局部实现差异待核验。
- 更新内容：确认累计退款恰好 €200 的审批边界，金额含税/币种与累计范围；区分销售补偿、信用单、Refund AR 申请及实际银行付款，补重复提交、部分退款、失败与到账核对。已有代码分析仅作为核验线索。
- 完成条件：199.99/200/200.01 及跨次累计有批准规则和对应验证；文档不再把信用单生成等同于资金到账。
- 建议维护角色：Sales Ops／财务／IT（未分配具体负责人）。
- 补充依据：[sales-refund](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/sales-refund.md:121>)；保留其原有草稿／未验证边界。

#### W10 · 采购与临时额度审批区间

- 页面：[Studio Access／Approve](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Admin 操作/Studio Access／Approve.md>)；[ODOO Sprint 260212-Credit Limit Control](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo迭代/Odoo Sprint Release Note/ODOO Sprint 260212-Credit Limit Control.md>)。
- 类型：原文阈值边界和岗位信息不完整。
- 更新内容：把采购 <30万、>30万、>50万及临时额度 >1万、≥5万整理成无重叠/遗漏的区间；确认等于阈值、币种、汇率、批准效果与生效时点。用岗位说明责任，具体人员映射保留更新日期。
- 完成条件：采购30万/50万、额度1万/5万及边界两侧都有明确审批链，财务和采购确认当前配置。
- 建议维护角色：采购／财务／审批维护方（未分配具体负责人）。
- 补充依据：[customer-credit](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/customer-credit.md:113>)；保留其原有草稿／未验证边界。

#### W11 · 销售预付款与信用占用

- 页面：[Sales Prepayment](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Accounting/Sales Prepayment.md>)；[ODOO Sprint 260212-Credit Limit Control](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo迭代/Odoo Sprint Release Note/ODOO Sprint 260212-Credit Limit Control.md>)。
- 类型：原文绝对表述需业务和实现核对。
- 更新内容：限定“创建预付款后不占信用额度”的条件；补部分/全额预收、付款及银行核销前后、取消/退款对占用与释放的影响，注明公司/币种/时间口径。
- 完成条件：财务确认部分预付、全额预付、未核销和退款四类样例的信用占用；不直接以代码推导政策。
- 建议维护角色：财务／Sales Ops／IT（未分配具体负责人）。
- 补充依据：[sales-invoice](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/sales-invoice.md:239>)；保留其原有草稿／未验证边界。

#### W12 · 采购预付款与尾款账单

- 页面：[Purchase Prepayment 供应商预付款](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Purchase/Purchase Prepayment 供应商预付款.md>)。
- 类型：异常流程和适用边界需确认。
- 更新内容：补“删除自动生成账单、重新下推”的允许账单状态与查重条件；覆盖部分收货、退货、尾款小于预付款、Credit Note、结转/退款、重复建单及联系 IT 的材料和承接责任。
- 完成条件：财务/采购签署尾款处理矩阵，读者能分清草稿账单、过账账单和银行支付，异常有明确承接入口。
- 建议维护角色：采购／财务／IT（未分配具体负责人）。
- 补充依据：[purchase-settlement](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/purchase-settlement.md:162>)；保留其原有草稿／未验证边界。

#### W13 · 角色、访问包与账号停用

- 页面：[Studio Access／Approve](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Admin 操作/Studio Access／Approve.md>)；[权限管理](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Admin 操作/权限管理.md>)；[User Account Access](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Admin 操作/User Account Access.md>)；[Create／Close User Account](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/基础/Create／Close User Account.md>)。
- 类型：权限说明与已有静态分析待对照。
- 更新内容：复核访问模块“只能收窄不能扩权”的绝对表述；分别解释角色/组/ACL/记录规则/访问包、UI 隐藏与服务端限制。补新增/调岗/离职的公司范围、授权批准、待办交接、账号和员工停用结果核对。
- 完成条件：实际模块及配置核对后形成岗位×公司×操作矩阵，代表身份验证通过；不以隐藏按钮证明服务端授权。
- 建议维护角色：权限管理员／HR／IT（未分配具体负责人）。
- 补充依据：[access-governance](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/access-governance.md:89>)；保留其原有草稿／未验证边界。

### P2：补齐与统一说明

#### W03 · Contact 预订单／欠单总览

- 页面：[【Internal】Back Order & Pre Order Overview Page by Conta-ClI4wUjK](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Sales/【Internal】Back Order & Pre Order Overview Page by Conta-ClI4wUjK.md>)。
- 类型：原文歧义与适用范围待确认。
- 更新内容：澄清 60 天橙色／红色重叠及超过 60 天的颜色、日期与时区；补 Available Quantity 为负时的显示；区分人工数量检查与系统校验，标明单张来源限制、实际生成 Quotation、适用环境及发布范围。
- 完成条件：29/30/59/60/61 天、零/负库存及转单结果都有维护方确认口径；不以历史 UAT 代替生产发布。
- 建议维护角色：Sales Ops／产品／IT（未分配具体负责人）。
- 补充依据：[preorder-backorder](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/preorder-backorder.md:244>)；保留其原有草稿／未验证边界。

#### W14 · Contact 建档、核验与父子关系

- 页面：[Contact Management Operation Guideline](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Contact Management Operation Guideline.md>)；[ODOO Sprint 260122-Contact Management](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo迭代/Odoo Sprint Release Note/ODOO Sprint 260122-Contact Management.md>)。
- 类型：空白章节与跨版本职责差异。
- 更新内容：补 Parent&Child 空白章节，说明企业/联系人/地址的归属和改挂影响；统一不同版本必填字段、Credit Specialist/Tax Specialist/Head office 的核验分工，标明资料重审条件及 Validated 下游使用是否由系统阻断。
- 完成条件：客户/供应商有独立当前必填表和批准流程，父子关系与地址例子完整；旧发布说明保留历史日期，不简单合并字段并集。
- 建议维护角色：Sales Ops／采购／信用/税务维护方（未分配具体负责人）。
- 补充依据：[business-party](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/business-party.md:985>)；保留其原有草稿／未验证边界。

#### W15 · Portal 购买权限与客户可见范围

- 页面：[【Internal】Portal Customer Permission Management Guideli-TsKXwBn9](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Dealer Portal/【Internal】Portal Customer Permission Management Guideli-TsKXwBn9.md>)；[【Internal】 Portal Purchasing Access 配置及批量维护客户权限指南](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/基础/【Internal】 Portal Purchasing Access 配置及批量维护客户权限指南.md>)；[【Dealer Guide】“Pre Orders” New Page_ Overview & Details](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Dealer Portal/【Dealer Guide】“Pre Orders” New Page_ Overview & Details.md>)。
- 类型：跨页功能版本待统一。
- 更新内容：统一 Full/Spare Parts/No Purchasing 的当前定义及单客/批量入口；区分登录、看历史、售后、购买、预订单转单；确认父公司/子公司/门店账户的真实订单可见范围、权限更新生效与批量预览/失败收尾。
- 完成条件：用三类购买策略×代表账户说明允许/拒绝操作；各指南互链到同一现行定义，保留各自入口范围。
- 建议维护角色：Portal 产品／Sales Ops／IT（未分配具体负责人）。
- 补充依据：[business-party](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/business-party.md:993>)；保留其原有草稿／未验证边界。

#### W16 · 财务报表及现金流映射

- 页面：[财务报表](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Accounting/财务报表.md>)；[现金流量表](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Accounting/财务报表/现金流量表.md>)；[现金流量表科目配置](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Accounting/现金流量表科目配置.md>)。
- 类型：现有入口简略，建议补充操作与核对。
- 更新内容：补正式报表版本、公司/期间/币种、BS/PL/CL/毛利/FIFO 入口与责任；现金流从单一 AP 穿透案例补到映射维护、跨公司适用、常见差异及验收，区分配置修改和对外报表签署。
- 完成条件：给出一次完整报表生成与对账样例，财务确认映射版本、允许差异和签署人；不把导出视为审批完成。
- 建议维护角色：财务／报表维护方（未分配具体负责人）。
- 补充依据：[financial-reporting](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/financial-reporting.md:166>)；保留其原有草稿／未验证边界。

#### W17 · Shopify 同步边界及异常收尾

- 页面：[Shopify-Odoo 同步系统说明](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo系统功能梳理/Shopify-Odoo 同步系统说明.md>)；[Shopify Webhook 逻辑说明](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo系统功能梳理/Shopify-Odoo 同步系统说明/Shopify Webhook 逻辑说明.md>)；[Shopify 订单行价格与折扣说明（Eu-Tenways ／ Shopify）](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo系统功能梳理/Shopify-Odoo 同步系统说明/Shopify 订单行价格与折扣说明（Eu-Tenways ／ Shopify）.md>)。
- 类型：已有说明基础上的维护建议。
- 更新内容：保留已有幂等风险和草稿/非草稿更新说明；总览互链到专题，补适用实例/环境及核验时间、已知风险当前状态、订单未同步/重复/金额差异的诊断入口和重试前结果核对。
- 完成条件：总览与专题对相同订单状态给出一致范围；风险有当前证据与责任，不把历史风险断言成当前故障。
- 建议维护角色：集成维护方／Sales Ops（未分配具体负责人）。

#### W18 · 仓库与外部接口现行说明

- 页面：[Odoo与外部接口对接梳理](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo系统功能梳理/Odoo与外部接口对接梳理.md>)；[ODOO仓储物流场景梳理](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo系统功能梳理/ODOO仓储物流场景梳理.md>)。
- 类型：新旧接口资料需要当前范围确认。
- 更新内容：将 Burger/EMTC/CMC 的 Sprint 字段变更与现行接口表互链；标明 CMC 不走 Connecta 的适用范围，补各仓 WMS 状态、发送/接收/取消/回传的完成标准、异常承接及当前启用入口。
- 完成条件：维护方签署环境×仓库×连接器现状表，每条现行接口有规范和异常入口；历史字段变更保留日期。
- 建议维护角色：物流／仓库／集成维护方（未分配具体负责人）。
- 补充依据：[warehouse-operation](</home/deploy/projects/odoo-eu-guide/docs/ontology/objects/warehouse-operation.md:192>)；保留其原有草稿／未验证边界。

#### W19 · 邮件、站内信与通知

- 页面：[消息模块以及通知模块](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/消息模块以及通知模块.md>)；[SO邮件文档说明](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo Manual/Sales/SO邮件文档说明.md>)。
- 类型：原文只有问题提纲或不完整章节。
- 更新内容：补外部邮件进入 Odoo、主动发信、订单自动邮件、模板、收件人/抄送、关注者与站内通知区别；补未收到、失败、重复发送的排查材料及当前环境适用范围。
- 完成条件：每种触发都有渠道/接收人/查看结果/失败处理说明，人工与自动发信分开；与订单状态文档互链。
- 建议维护角色：业务支持／邮件维护方（未分配具体负责人）。

### P3：流程文档收尾

#### W20 · 研发迭代流程文档

- 页面：[Odoo 迭代研发流程](</home/deploy/projects/odoo-eu-guide/docs/odoo-lark-wiki/Odoo迭代/Odoo 迭代研发流程.md>)。
- 类型：明确 TODO。
- 更新内容：补迭代流程图和“问：TODO”；为需求、技术评审、开发、测试、UAT、发布列清输入/输出、责任与门槛，链接当前模板和实际发布/回滚流程。
- 完成条件：TODO 有正式内容或明确的暂缓说明；流程各阶段可定位当前模板、负责人角色和完成证据。
- 建议维护角色：PM／研发／测试／发布负责人（未分配具体负责人）。

### 执行与交付边界

1. 先确认页面的业务负责人、适用环境／版本及当前规则，再修订正文；审批、估值、信用等未决政策不能由本清单代定。
2. 历史 Release Note 保留发布日期和当时事实，补“现行操作见…”入口；现行 SOP 用一份主文档维护规则，其他页引用，不把所有历史字段／权限简单取并集。
3. 修改普通手册时记录更新时间、范围、关键结果与异常承接；目录页按导航维护，不因正文短就全部改写。
4. 回写飞书后应核对真实保存结果，再同步本地导出；若 llm-wiki 依赖对应原文，再追加 raw 版本并复核受影响 concepts。本轮没有执行这些写操作。

### 派生产物与覆盖限制

- [20 项更新队列 CSV](</home/deploy/.codex/visualizations/2026/10/12/01a12eb3-fb10-7d92-98e9-adec9e88b371/lark-wiki-update-audit-20261012/update-queue.csv>)：目标页面、原飞书 URL、类型、更新内容、逐项完成条件、建议维护角色及补充依据。
- [117 节点盘点 CSV](</home/deploy/.codex/visualizations/2026/10/12/01a12eb3-fb10-7d92-98e9-adec9e88b371/lark-wiki-update-audit-20261012/page-inventory.csv>)：导出时间、类型、本地路径、原飞书 URL、文件 SHA-256、候选更新 ID 和检查范围。
- 两份 CSV 是本任务的派生交付；判定与决定以本记录为准。未关联更新项的页面仅做机械盘点，不能解释为“无需更新”。目标页进行了与本项有关的正文／片段核对，不代表整篇或全部 115 篇已逐条审阅。
- 原始图片保留外部引用，图片替代文字不代替查看截图；xlsx/video 内容、链接可达性和线上最新修订均未审阅。现有知识库的文章／实体欠账不直接转为原飞书文档待办。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-10-12 | v1 | in_progress | 确认用户指定的本地来源；盘点 117 节点与 115 文本页，开始核对正文、TODO、跨页差异及领域问题登记。 | 不把历史发布或代码分析当作生产规则；交付更新建议与验收条件。 |
| 2026-10-12 | v1 | done | 交付 20 个专题、37 个目标页面的更新清单及逐项完成条件；导出 20 行队列和 117 行页面盘点，60 个本地引用检查通过，文件 SHA-256 与盘点一致。 | 完成的是清单整理；未回写飞书、重同步或修改原文；剩余页面未做完整语义审计。 |

## 验证

| 类型 | 结果 | 边界 |
| --- | --- | --- |
| 导出清单静态检查 | 117 节点，115 文本页 | 2026-09-25 本地快照 |
| 文档引用 / 差异检查 | 通过 | 60 个本地引用及引用行号存在，20 项唯一、37 页去重，Markdown 空白/围栏与 `git diff --check` 通过；117 个本地文件哈希与盘点一致 |
| 线上修订 / 业务验证 / 应用测试 | 未执行 | 本轮仅整理文档更新清单 |
