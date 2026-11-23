# Platform Sync Tasks

范围：Lark、Meegle、GitHub 等平台之间的同步、回写、对账与排障。记录规则见 [Tasks 台账](../README.md)。

- [生产联系人头像补充到测试库](./2026-11-06-copy-lark-contact-avatars-to-test.md) — done；tenways_octo_test_1021 已补 113 个头像（更新 98、新增 15），事务提交及读回通过；生产只读。

- [Ticket 区间提取人员头像](./2026-11-06-lark-ticket-avatar-extraction.md) — done；按 open_id 增量更新 lark_contacts 头像，35 个相关测试、构建及 PostgreSQL 临时表验证通过；真实库仅预览，未 apply。

- [数据同步页展示 Ticket 自动任务状态](./2026-11-04-ticket-worker-status.md) — 两项任务卡片完成，展示配置及实际运行记录；Done 已由后续实现任务升级为可运行状态展示；未部署或启用 Worker。

- [工单按配置状态自动添加 Done 表情](./2026-11-04-lark-finished-ticket-reaction.md) — v7 已修复同日 TODATE 上界漏选，74 个相关用例及构建通过；2464 已补 Bot DONE 并验证重复执行。生产 Worker 已加载修复，首轮自动扫描成功；未回退水位或补扫历史。

- [Lark 工单数据未变化时跳过写入](./2026-11-04-lark-unchanged-sync.md) — 相同源快照及共享链接不再改写，已一致的清洗投影跳过写入，保留清洗修复能力；本地相关验证通过，未部署。

- [Lark 群话题自动登记 Ticket](./2026-11-03-lark-thread-ticket-intake.md) — v15 已于 11-23 重建 server 并重启生产 Worker，恢复编译版 ID 解析方法；原话题自动续跑创建工单 2560，AI 分析、标题、Lark Bot 确认和 +1 均通过真实读回，当前登记队列全部 done。94 个相关用例及构建通过。

- [GitHub EU、UK 增量搜索失败与定时任务停用排查](./2026-10-29-github-incremental-search-incomplete.md) — 已恢复两个定时任务，现有 Worker 同步 EU 9 条、UK 4 条均成功；按用户要求暂不修改错误处理，再次报错时再修复。

- [Ticket 字段编辑与 Lark 同步性能优化](./2026-10-21-lark-ticket-edit-sync-performance.md) — 第一阶段及 Lark App 六属性编辑完成；立即回显、连续编辑、版本保护和元数据缓存已实现，本地验证通过，尚未部署。
- [Odoo.sh 构建同步与通用消息发送 Worker](./2026-09-13-odoo-build-sync-and-message-delivery-workers.md)
