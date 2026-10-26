# AI Ticket Tasks

- [Lark Ticket AI：Hermes Agent AI 页签需求确认](2026-10-21-lark-hermes-answer-tab.md) — done（v6）；Sources Server 实时 / 历史事件及 FE 卡片已接通并部署，定向回归与构建通过；用户确认正文 Inline citation 暂不处理，真实模型 / 完整流程验收未恢复。

- [TEN-144：Lark Shadow Eval / Badcase 标注](2026-10-21-lark-badcase-design.md) — done（v4）；测试部署/迁移与两端业务验收完成，用户确认飞书“测试可用”；评测区和共用表单已精简并更新测试站，49 个 FE 测试入口、6 组 mock 浏览器及 10 组真实部署回归通过，QA 数据已清理。

- [Wiki 问答模型 HTTP 429 排障](2026-10-15-wiki-qa-provider-429.md) — in_progress；确认通用 API 返回1113，已修正提示与安全日志，92项测试/类型检查通过；最新真实模型+合成资料完整链路成功，真实Wiki验证待授权，未部署。

- [LLM wiki 优化与 KCS 试点评估](2026-10-13-wiki-kcs-optimization-assessment.md) — done（v3 详细设计交付）；[具体设计](../../tenways-octo/ticket-kcs-update-and-use-design.md)涵盖逐票 KCS 记录、更新差异/采纳、版本与冲突、wiki 增量和问答使用；评估保留用户讨论与官方方法依据；未修改应用、摄入知识或实施试点。

- [本地 Lark Odoo Wiki 原始文档更新清单](2026-10-12-lark-odoo-wiki-update-backlog.md) — done（清单交付）；按 09-25 本地导出盘点 117 节点，整理 20 个更新专题、37 个目标页面；明确缺项与业务待确认分开，未修改飞书或原始导出。

- [LLM wiki 更新机制与生产接入核查](2026-10-12-wiki-update-production-audit.md) — done（核查与文档）；生产 Server/Worker 在线且已配置共用 wiki；平台同步与 Shadow 定期运行，wiki 摄入仍需手动执行；取证脚本已按 v2 改为优先生产 octo；环境选择检查通过，真实问答/写入未验收。

- [User profile extractor 提炼与增量验证](2026-09-27-user-profile-extractor.md) — in_progress；需求v2仅输出JSON性格/沟通/需求特点，设计及原型已更新，20项测试通过；真实双用户验证需补需求人消息证据及外发授权，无数据库迁移或部署。

- [Ticket AI Evals CLI](2026-09-24-ticket-evals-cli.md) — done；单 Sheet 标注、冻结数据集、Server 执行、DeepEval 评分与报告已实现，本地/mock 验证完成，真实数据/模型及部署未验证。

- [Lark thread Ticket AI 只读应用](2026-09-23-lark-ticket-analysis-app.md) — in_progress；FE 分析/搜索与 H5 SDK 免登已实现，返回已验证用户 ID；签名及输入框菜单 openChatId 采集/日志已实现并通过本地验证；后台配置、部署与真实客户端验收待完成。

- [历史 Finish Ticket skip 重评](2026-09-22-historical-skip-reprocess.md) — in_progress；2026-09-23 按原始 1312 张与账本复核：1060 张 source_reviewed，252 张未完成原文复核（127 待补证、123 on_hold、2 张 no_distill/triaged 待核对）。草稿未视为人工签核。

- [LLM wiki Ticket 摄入现状核查](2026-09-22-wiki-ingestion-audit.md) — done（09-22 核查交付）；09-23 关联当前账本，原 90 张已有 82 张 source_reviewed、8 张待补证，13 张历史 skip 交集已登记复核；事项级验收与源端新鲜度未重验。

- [Lark Ticket AI 输出与 Eval 数据集视图](2026-09-01-lark-ticket-ai-output-eval-dataset-views.md) — done；v5 两行操作区（四图标 + 状态/人/时间）已实现，审核归属及 My evals 沿用 v4；迁移、部署和登录态验收未执行。

- Lark Ticket WeKnora 浮窗 — 原索引引用的 `2026-09-20-weknora-widget.md` 未找到；“待频道允许列表配置”为旧索引描述，状态待核实，不能据此认定已解决。

范围：Lark Ticket/工单 AI 分析、分类、回复建议、评测与反馈闭环。记录规则见 [Tasks 台账](../README.md)。

- [Wiki entities 批末联动与语义复核](2026-09-17-wiki-entity-maintenance.md) — done；机制与检查脚本已落地，存量语义复核和部署边界见记录。

- [Shadow 总结与风险/回复建议](2026-09-03-shadow-summary-worker.md) — done（本地开发验证）；v14 Shadow 接入 Wiki 召回/重排，Wiki 与 Shadow 共用默认20篇可配上限，失败时聊天分析降级；保留 v12 共用 thread 与 v11 风险/回复功能；尚未部署或验证真实模型，调度/性能后续处理。

- [Lark App 分析页异步接入 WeKnora](2026-09-25-lark-app-weknora.md) — done；已接入并增加服务可用性检测及超时隐藏，本地测试和构建通过，未部署或真实客户端验收。
