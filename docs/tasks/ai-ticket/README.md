# AI Ticket Tasks

- [Lark thread Ticket AI 只读应用](2026-09-23-lark-ticket-analysis-app.md) — in_progress；FE 分析/搜索与 H5 SDK 免登已实现，返回已验证用户 ID；签名及输入框菜单 openChatId 采集/日志已实现并通过本地验证；后台配置、部署与真实客户端验收待完成。

- [历史 Finish Ticket skip 重评](2026-09-22-historical-skip-reprocess.md) — in_progress；2026-09-23 按原始 1312 张与账本复核：1060 张 source_reviewed，252 张未完成原文复核（127 待补证、123 on_hold、2 张 no_distill/triaged 待核对）。草稿未视为人工签核。

- [LLM wiki Ticket 摄入现状核查](2026-09-22-wiki-ingestion-audit.md) — done（09-22 核查交付）；09-23 关联当前账本，原 90 张已有 82 张 source_reviewed、8 张待补证，13 张历史 skip 交集已登记复核；事项级验收与源端新鲜度未重验。

- [Lark Ticket AI 输出与 Eval 数据集视图](2026-09-01-lark-ticket-ai-output-eval-dataset-views.md) — done；v5 两行操作区（四图标 + 状态/人/时间）已实现，审核归属及 My evals 沿用 v4；迁移、部署和登录态验收未执行。

- Lark Ticket WeKnora 浮窗 — 原索引引用的 `2026-09-20-weknora-widget.md` 未找到；“待频道允许列表配置”为旧索引描述，状态待核实，不能据此认定已解决。

范围：Lark Ticket/工单 AI 分析、分类、回复建议、评测与反馈闭环。记录规则见 [Tasks 台账](../README.md)。

- [Wiki entities 批末联动与语义复核](2026-09-17-wiki-entity-maintenance.md) — done；机制与检查脚本已落地，存量语义复核和部署边界见记录。

- [Shadow 总结与风险/回复建议](2026-09-03-shadow-summary-worker.md) — done（本地开发验证）；v14 Shadow 接入 Wiki 召回/重排，Wiki 与 Shadow 共用默认20篇可配上限，失败时聊天分析降级；保留 v12 共用 thread 与 v11 风险/回复功能；尚未部署或验证真实模型，调度/性能后续处理。

- [Lark App 分析页异步接入 WeKnora](2026-09-25-lark-app-weknora.md) — done；已接入并增加服务可用性检测及超时隐藏，本地测试和构建通过，未部署或真实客户端验收。
