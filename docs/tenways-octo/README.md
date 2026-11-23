# Octo 领域与产品文档

Octo 把 IT 支持、研发执行和交付信息放进同一工作台。Lark Base 保存工单，Meegle 跟踪研发工作，GitHub 保存 PR，Odoo.sh 提供构建结果。Octo 提供查询、授权操作、工单分析和知识检索。[领域术语表](GLOSSARY.md)说明这些对象和业务用语。

## 用户入口与职责

| 入口 | 职责 | 查阅 |
| --- | --- | --- |
| Web 工作台与 Lark 内嵌 Ticket AI | 查看工单、工作项、Sprint 和 PR。按权限编辑工单、执行同步或打开分析。 | [工作台路由](../../fe/src/app/routes/workspace-routes.js) · [FE 接入说明](../../fe/README.md) |
| 浏览器插件 | 识别当前平台页面，采集单条或批量上下文，触发授权和页面动作。 | [插件使用文档](20-extension-user-guide.md) · [页面动作规则](../ai-dev/rules/system-boundaries-and-code-rules.md#3-action-config-and-executor-contract) |
| Octo Server | 解析身份和权限，编排业务操作，保存本地数据，通过 adapter 调用外部平台。 | [API 注册](../../server/src/index.ts) · [Server 规则](../ai-dev/rules/server-code-rules.md) |
| 平台同步 Worker | 按配置运行同步及独立后台任务，包括 Lark 话题登记、完成表情等。 | [Worker 入口](../../server/src/scripts/platform-sync-worker.ts) · [同步与调度](it-platform-sync.md) |

## 数据归属与身份

| 对象 | 身份范围 | 权威来源 |
| --- | --- | --- |
| Octo 用户 | `users.id` 为 Octo 内部身份。Lark 登录身份由 `lark_tenant_key + lark_id` 确定。 | Octo 持有账号及平台绑定。Web Session 和外部平台授权各自校验。 [身份索引](../../server/src/adapters/postgres/database.ts) · [登录与授权](../../fe/README.md#lark-login-boundary) |
| Lark Ticket | `base_id + table_id + record_id` | Lark Base 持有源字段。工单讨论由消息链接关联至 Lark IM，消息和话题有各自的 ID。 [工单服务](../../server/src/application/services/lark-ticket.service.ts) · [线程上下文](../../server/src/application/services/lark-ticket-thread-context.service.ts) |
| Meegle 工作项 | `project_key + work_item_type_key + work_item_id` | Meegle 持有源工作项、状态和节点。Octo 保存观察或推定的 Sprint 归属区间，根据区间与 Sprint 日期计算历史分类。 [归属规则](../../server/src/domain/meegle-sprint-membership.ts) · [Sprint 同步](it-platform-sync.md#57-sprint-归属历史与派生分类) |
| GitHub PR | `owner + repo + pull_number` | GitHub 持有标题、分支和 PR 状态。工作台按工作项关联显示 PR，可另行读取 Odoo.sh 的环境构建结果。 [PR 关联](../../server/src/application/services/meegle-pull-request-link.service.ts) · [构建读取](../../fe/README.md#meegle-odoosh-构建状态) |

`*_syncs` 保存外部对象的当前快照和同步信息。使用同一组源标识关联的 `*_octo` 保存 Octo 自有数据，例如正式 Ticket AI、Shadow AI 和本地删除标记。清洗用于本地查询和展示。同步按范围维护进度，工单线程有独立的按需同步与版本。 [同步存储](../../server/src/adapters/postgres/platform-sync-store.ts) · [同步数据归属](it-platform-sync.md#4-数据归属与写入规则目标设计)

## 常用业务链路

| 场景 | 对象如何关联 | 查阅 |
| --- | --- | --- |
| Lark 话题登记 Ticket | 配置将源群绑定到指定 Base 数据表。启用登记任务后，应用机器人用已验证的话题身份查重，登记根话题、同步工单、生成标题并回帖确认。链接中的客户端数字话题 ID 需要核对到 Open API 话题身份。 | [登记服务](../../server/src/application/services/lark-thread-ticket-intake.service.ts) · [登记与完成表情](it-platform-sync.md#群话题自动登记工单) |
| Ticket 转研发工作 | 插件和有权限的工作台入口复用服务端建单流程。Server 读取 Base 记录，按 Issue 类型映射创建一个或多个 Meegle 工作项，再将结果链接写回 Base。现有 Meegle 链接会触发跳过。 | [建单服务](../../server/src/modules/lark-base/lark-base-workflow.service.ts) · [建单生命周期](../ai-dev/lifecycle/current-system-technical-objects.md#8-lark-base-到-meegle-工作项生命周期) |
| 需求与缺陷分析 | 插件可对 Lark Bug 发起分析，也可将 Meegle Story 的 PRD 转成研发 Review 简版。分析与建单分别触发。 | [Lark Bug 分析](../ai-dev/lifecycle/current-system-technical-objects.md#11-lark-bug-分析生命周期) · [Meegle Story 研发 Review](../ai-dev/lifecycle/current-system-technical-objects.md#10-meegle-story-研发review-生命周期) |
| 工作项关联 PR | Server 根据工作项的 System 限定候选仓库，校验 PR 仍开放后，可在其 GitHub 标题写入 `m-<workItemId>`。工作台通过本地快照展示关联信息。 | [PR 关联服务](../../server/src/application/services/meegle-pull-request-link.service.ts) · [GitHub 工作项动作](../ai-dev/lifecycle/current-system-technical-objects.md#14-github-工作项动作生命周期) |
| 工单修改与本地隐藏 | 属性保存向 Lark 写入并同步单票。批次分别跟踪写入及同步结果。标记删除作用于 Octo 的可见性，历史和 Lark 记录仍可用于追溯。 | [批量保存契约](lark-ticket-batched-save.md) · [工单操作入口](../../server/src/modules/lark-ticket/lark-ticket.controller.ts) |

平台同步读取外部平台并更新 Octo 副本。建单、属性保存、Meegle 对 Lark 的回写、PR 关联和 Bot 回复是各自授权的业务动作。 [同步入口与写入方式](it-platform-sync.md#22-当前触发入口) · [Meegle 对 Lark 回写](../../server/src/application/services/meegle-lark-push.service.ts)

## 工单分析与知识

| 能力 | 数据与边界 | 查阅 |
| --- | --- | --- |
| 正式 Ticket AI、Shadow AI、Eval | 正式结果写 `ticket_ai`，Shadow 写 `shadow_ai`。Eval 独立保存选入时的输出及样本版本，Badcase 标注附在对应样本上。 | [本地 AI 写入](../../server/src/adapters/postgres/platform-sync-store.ts) · [Shadow 服务](../../server/src/application/services/lark-ticket-shadow-summary.service.ts) · [Eval 服务](../../server/src/application/services/lark-ticket-eval-dataset.service.ts) |
| Wiki 问答与 ACP | Wiki 问答将本票材料与检索证据一起用于回答。ACP 以用户及关联业务对象归属会话，新 Ticket 会话记录使用的线程版本。支持写回的受控动作先产出草稿，由用户确认。 | [Wiki QA](../../server/src/application/services/wiki-qa.service.ts) · [Ticket AI 会话](../../server/src/application/services/lark-ticket-ai-session.service.ts) · [写回确认](../../server/src/application/services/support-ticket-effect-draft.service.ts) |
| KCS 工单文档 | Octo 已提供 `ticket-kcs`，导出符合条件的已同步 `Finish` 工单和可用线程材料，支持原图取证和生成草稿。Guide 处理逐票文档的生成、复核和发布。Shadow 可从知识目录召回其他工单的 KCS 作为历史参考，并排除本票。 | [KCS CLI](../../server/src/scripts/ticket-kcs.ts) · [历史 KCS 与审核记录](../tasks/ai-ticket/2026-09-03-shadow-summary-worker.md#2026-11-20-v17-shadow-召回历史-kcs) |

[Ticket KCS 更新与使用设计](ticket-kcs-update-and-use-design.md)是逐票编辑、版本和使用记录的提案。相关数据表、编辑界面和使用反馈闭环仍属设计范围。

## 进一步查阅

- 工程规则、当前技术对象与错误契约见 [AI Dev 入口](../ai-dev/README.md)和[技术对象生命周期](../ai-dev/lifecycle/current-system-technical-objects.md)。任务目标、进展与各环境验证记录见[任务台账](../tasks/README.md)。
- 集成设计见 [Meegle Adapter](09-meegle-adapter-design.md)、[Meegle 认证桥](10-meegle-auth-bridge-design.md)、[身份设计](18-user-identity-design.md)和[数据与安全设计](06-data-security.md)。
- 插件和服务端设计基线见[总体架构](04-architecture.md)、[详细架构](21-system-architecture-detailed.md)、[插件消息协议](11-extension-message-and-api-schema.md)、[字段与状态机](12-field-schema-and-state-machine.md)和[代码结构](13-code-structure-and-validation-design.md)。调用接口时以[路由注册](../../server/src/index.ts)与[路由测试](../../server/src/index.test.ts)为准。
- 早期产品范围见[需求概述](01-requirements-overview.md)、[业务流程](02-business-flow.md)、[PRD](03-prd.md)、[Agent 和 Skill 设计](05-ai-agent-skill-design.md)、[开放问题](08-open-questions.md)及 [PM 分析 Prompt](14-pm-analysis-prompt-iteration-log.md)。其中的 `A1/A2/B1/B2` 是早期业务代号。
- [一期路线](history/07-phase-1-rollout.md)、[早期开发计划](../superpowers/plans/2026-03-20-it-pm-assistant-implementation-plan.md)和 [Popup 重构计划](history/15-popup-refactor-plan.md)用于追溯实施过程。
- ACP 演进见 [ACP V1 设计](17-acp-design.md)、[V2 演进设想](history/14-v2-architecture-design.md)、[ACP 与 PM 分析讨论](history/18-acp-pm-analysis-skill-notes.md)及[外部参考快照](../reference-acp/docs/README.md)。已归档的[认证方案](archived/16-auth-flow-design.md)、[Lark Base 插件替补方案](archived/19-lark-base-plugin-fallback-design.md)和 [SSO 方案](archive/19-sso-module-design.md)保留原设计背景。
