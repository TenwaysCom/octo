---
title: "更换 Odoo.sh 通知群及排查旧群仍收到消息"
module: engineering-ops
status: done
requirement_version: 3
created_on: 2026-09-16
updated_on: 2026-09-18
closed_on: 2026-09-18
owner: Codex
related:
  - "../platform-sync/2026-09-13-odoo-build-sync-and-message-delivery-workers.md"
---

# 更换 Odoo.sh 通知群及排查旧群仍收到消息

## 目标

将 Odoo.sh 新通知目标改为 `oc_a50cf5c83845e52e007b0394ad3e4470`。v2 增加实际进程与消息记录核验，排查用户重启后旧群仍收到通知的原因。

当前 v3：关闭 staging 的 `scheduler.tasks.messageDelivery.enabled` 并重启 staging Server，使通用消息发送停止；production 保持运行。

## 验收标准

- [x] 本地配置、默认值及示例使用新群 ID。
- [x] 区分 production / staging 实际配置、启动时间与消息记录。
- [x] 重启仍持有旧配置的 staging Server，验证新进程与健康状态。
- [x] v3：staging 发送开关为 false，新 Server 不启动发送任务，健康检查通过，其他进程未变化。

## 背景与范围

本记录在当前 checkout 缺失，但生命周期文档仍引用此路径，按会话中的 v1 事实恢复并续记。v1 修改配置且相关测试 26 passed，未重启 Server。v2 用户反馈已重启 server/worker，但旧群仍收到新通知。

## 方案与决策

Odoo 构建刷新及通用发送由 Server 托管；独立 platform-sync-worker 不管理这两项任务。配置在启动时加载，已入队消息保留生成时目标。两个环境配置均已是新群；production 已加载，staging 仍运行旧进程。仅重启已核对目录的 octo-server-staging，不改 production、独立 Worker、通知范围或历史消息。重启前只读核实两库均无待发送/发送中 Odoo 消息；不发送测试通知、不重放历史记录。

上述为 v2 修复经过；v3 替代 staging 继续发送的运行方案：仅将 staging 本地 JSON 的 messageDelivery.enabled 设置为 false，不修改默认值、示例或 production 配置。Odoo 同步及业务消息入队继续，队列保留；恢复 enabled=true 并重启后会继续处理符合条件的待发消息。本开关不覆盖其他业务直接发送链路。重复设置 false 幂等；本轮不清空或改写消息队列。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-16 | v1 | done | 本地 JSON、默认值与示例修改为新群；配置测试 26 passed，静态断言和 diff 检查通过（会话历史）。 | 未重启或验证送达。 |
| 2026-09-18 | v2 | in_progress | PM2 只读检查：production 从 09-17 13:30 香港时间运行，staging 从 09-15 17:16 运行。两份 JSON 均已是新群。数据库只读核验 production 在 09-17 21:30:40 新群记录为 sent；staging 在 21:46:59 旧群记录为 sent，与两边发送日志吻合。 | 重启 staging 并检查健康状态。 |
| 2026-09-18 | v2 | done | 13:45 香港时间重启 staging，PID 2702642 → 3486495，PM2 online，健康接口 HTTP 200；新进程启动发送与刷新调度，EU/UK/US 首轮全部完成且新增通知均为 0。逐项核实其他进程 PID 与启动时间未变。 | 未发送测试消息；staging 下一条自然通知送达尚待观察。 |
| 2026-09-18 | v3 | in_progress | 用户要求关闭 staging 消息发送；确认字段为 enabled，修改该环境本地配置并重启。 | 待验证实际发送任务停用与健康状态。 |
| 2026-09-18 | v3 | done | 编译后实际配置解析器断言 messageDelivery=false、odooSh=true；16:00 香港时间重启 staging，PID 4182883、PM2 online、健康接口 HTTP 200。新 PID 日志明确 Message delivery not started，且无 MESSAGE_DELIVERY_STARTED。其他 PM2 进程 PID 与启动时间不变。 | Odoo 同步及入队继续；恢复开关会继续处理队列。本轮无业务代码改动或测试发送。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 已核实配置加载与职责归属 | server/src/index.ts、server/src/config/platform-sync-config.ts | production dist 的默认群仍旧，但 JSON 显式新值优先生效。 |
| v3 配置 / 运行时 | 通过 | 实际 dist 配置解析断言；PM2 read-back；新 PID 停用日志；健康接口 HTTP 200 | 本地 JSON 被 Git 忽略；无业务代码改动，未重复执行单测或构建。 |
| 运行时只读核验 | 已定位旧群通知来源 | PM2 进程元信息；两库 message_outbox 的目标、状态、时间；09-17 两环境 MESSAGE_SENT 日志 | 仅输出安全字段，不读取正文；sent 为发送成功落库记录，未向 Lark 回读消息。 |
| 运行修复 | 通过 | 重启 octo-server-staging；PM2 read-back；GET :3030/api/health HTTP 200；09-18 新 PID 启动与刷新完成日志 | 未构建或改动业务代码，未运行单测；新群已有 production 发送成功记录，staging 下一条自然通知尚待观察。 |
