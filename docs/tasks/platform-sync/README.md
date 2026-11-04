# Platform Sync Tasks

范围：Lark、Meegle、GitHub 等平台之间的同步、回写、对账与排障。记录规则见 [Tasks 台账](../README.md)。

- [数据同步页展示 Ticket 自动任务状态](./2026-11-04-ticket-worker-status.md) — 两项任务卡片完成，展示配置及实际运行记录；Done 已由后续实现任务升级为可运行状态展示；未部署或启用 Worker。

- [工单按配置状态自动添加 Done 表情](./2026-11-04-lark-finished-ticket-reaction.md) — v7 已修复同日 TODATE 上界漏选，74 个相关用例及构建通过；2464 已补 Bot DONE 并验证重复执行。生产 Worker 已加载修复，首轮自动扫描成功；未回退水位或补扫历史。

- [Lark 工单数据未变化时跳过写入](./2026-11-04-lark-unchanged-sync.md) — 相同源快照及共享链接不再改写，已一致的清洗投影跳过写入，保留清洗修复能力；本地相关验证通过，未部署。

- [Lark 群话题自动登记 Ticket](./2026-11-03-lark-thread-ticket-intake.md) — v7 已复用现有 thread ID 缓存查重，76 个相关用例及构建通过；指定 pending 恢复为工单 2465 / done，真实读回与重复提交通过。后续 Done 修复已重载同一生产 Worker，运行时证据见 Done 任务。

- [Ticket 字段编辑与 Lark 同步性能优化](./2026-10-21-lark-ticket-edit-sync-performance.md) — 第一阶段及 Lark App 六属性编辑完成；立即回显、连续编辑、版本保护和元数据缓存已实现，本地验证通过，尚未部署。
- [Odoo.sh 构建同步与通用消息发送 Worker](./2026-09-13-odoo-build-sync-and-message-delivery-workers.md)
