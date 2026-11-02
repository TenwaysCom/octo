---
title: "DevOps 会话失效诊断与可配置自动通知"
module: platform-auth
status: done
requirement_version: 3
created_on: 2026-11-02
updated_on: 2026-11-02
closed_on: 2026-11-02
owner: Codex
related:
  - "../../../server/src/adapters/odoo-devops/odoo-devops-branches-client.ts"
  - "../../../server/src/application/services/odoo-devops-branches.service.ts"
  - "../../../server/src/modules/github-pr-odoo-devops-build/github-pr-odoo-devops-build.controller.ts"
---

# DevOps 会话失效诊断与可配置自动通知

## 目标

回答 Octo PR 的 Odoo.sh 状态是否获取失败，并确认失败层。v3 用户明确选择“自动通知，群和接收人可配置”：增加 DevOps 鉴权失效自动告警，复用现有定时刷新和通用消息发送器，支持独立配置通知群与 @接收人的 GitHub 登录名。默认兼容旧配置保持关闭，本地配置使用「IT系统通知」和 Ben Lin（`uynil`）。不修改会话凭证，不执行部署或重启，不再次发送测试通知。

## 验收标准

- [x] 区分上游状态获取失败与前端显示问题。
- [x] 核对最近成功时间、首次鉴权失败时间及影响环境。
- [x] 使用现有服务端配置复现并提出恢复步骤，明确未验证边界。
- [x] 核实目标群配置和 Ben Lin 的现有身份绑定。
- [x] 发送且核验一条包含 @Ben Lin 的通知，记录安全消息标识并防止重复发送。
- [x] 定时刷新只对类型化鉴权失效错误生成告警；网络错误和上游 5xx 不误报登录失效。
- [x] 群、开关及 @接收人通过现有 JSON 配置，并复用唯一 active 用户绑定；无效配置拒绝加载。
- [x] 合并 EU/UK/US 为一条通知，同一会话和群跨轮次、重启幂等去重；入队失败可重试，新会话可产生新告警。
- [x] 完成针对性单测、队列 mock integration、Server 构建验证及相关文档更新，明确未部署边界。

## 方案与决策

确认上游鉴权拒绝：当前服务端配置的 DevOps 会话访问 EU、UK、US 的 branches 接口均返回 HTTP 401；现有 adapter 映射为 `ODOO_DEVOPS_AUTH_REQUIRED`。不能仅据 401 区分会话过期、撤销或上游鉴权规则变化。

状态读取依赖 DevOps 环境快照；刷新失败会保留已有旧快照，无快照时表现为刷新中或不可用。没有证据将此次问题归因于前端移除了显示逻辑。当前磁盘配置也无法通过鉴权，因此仅“运行进程仍使用旧配置”不能单独解释故障。

恢复建议：在 DevOps 重新登录，通过既有安全方式更新服务端 `ODOO_DEVOPS_SESSION`，重启对应 Octo Server 使启动时读取的配置生效，再验证三环境状态获取和 PR 页面。此恢复操作未执行；用户未在本次诊断中要求修改授权配置。

v2 单次通知复用 production 配置的 Odoo.sh 群及通用消息 outbox，由现有发送器处理；以本次事件的固定幂等键去重。Ben Lin 使用已有 `ben lin → uynil` 映射和唯一 active 用户的 Lark 身份，不根据显示名猜测 open ID。发生结果不确定时先对账，不直接重发。此要求替代 v1 的纯只读操作范围，原诊断结论保留。

v3 替代 v2 的“只做本次人工通知”后续范围，已发送的人工通知保留。新增 `scheduler.tasks.odooSh.authFailureNotification`，包含 `enabled`、可选 `chatId`（缺省继承 Odoo.sh 群）和 `recipientGithubLogins`。定时刷新聚合类型化 `ODOO_DEVOPS_AUTH_REQUIRED`，由 Server 应用服务解析接收人并组装正文，写入既有 outbox。幂等键使用会话的 SHA-256 摘要和目标群，不保存原始会话；同一会话同一群只入队一次，发送重试/未知结果沿用通用队列策略。更换会话后再次失效可入队新告警；不增加定时催办或恢复通知。接收人未绑定时群通知保留并记录安全诊断；数据库读取或入队失败在后续刷新重试。

构建输出定向到 `/tmp`，避免当前 production PM2 的 dist watch 触发部署或重启。原诊断和人工消息证据仍有效；不能替代 v3 自动告警的测试和部署验收。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-02 | v1 | done | `server/logs/app.2026-11-02.*.log`：UK/US 最后定时刷新成功 10:13:11，EU 10:13:12；三环境首次 `ODOO_DEVOPS_BRANCHES_AUTH_REJECTED` 均为 10:43:07、status=401；11:54:51 仍报 401。时间均为 Asia/Shanghai。 | 失效发生在最后成功与首次失败之间；不是精确过期时间。未检查上游会话存储或鉴权变更。 |
| 2026-11-02 | v1 | done | 使用已编译的真实 Odoo DevOps adapter 和 `server/.env` 配置，各调用一次 `listBranches`，三环境均为 `unavailable / 401 / ODOO_DEVOPS_AUTH_REQUIRED`，可用性断言 FAIL。 | 仅输出环境、状态与安全错误码，不输出凭证或响应体；未恢复授权。 |
| 2026-11-02 | v2 | in_progress | 用户明确要求只发本次通知；已确认本地为 production，现有消息发送任务开启，目标使用既有 Odoo.sh 群；唯一 active GitHub `uynil` 绑定的姓名为 Ben Lin 且可 @。 | 待发送及 read-back；无自动告警改动。 |
| 2026-11-02 | v2 | done | Lark 只读核验目标群为「IT系统通知」且 Ben Lin 在群内。以固定幂等键 `odoo-devops-auth-notice:2026-11-02:104307:ben-lin` 入队一条人工通知；11:59:25（Asia/Shanghai）发送成功，outbox `28b8e644-7b9c-468f-8ef6-ce74644bd7e7` 为 sent，message ID `om_x100b61b4e716a8a8fe0276e9e425cf4`。Lark 回读确认消息存在、目标群一致、@Ben Lin 有效且未删除。 | 成功送达不证明 Ben 已阅读或登录态已恢复；未增加自动通知。 |
| 2026-11-02 | v2 | done | 用户询问登录数据位置及修改方法：已说明 Octo 的 `server/.env` 中 `ODOO_DEVOPS_SESSION` 在启动时读取，更新有效会话后需重启 `octo-server-production` 并复验。 | 仅说明操作方法，未读取输出会话值、修改配置或执行重启。 |
| 2026-11-02 | v3 | in_progress | 用户确认加入自动通知，群和接收人可配置；已复核现有 scheduler、outbox、身份绑定及配置加载边界。 | 待实现与本地验证；不部署，不触发实际自动消息。 |
| 2026-11-02 | v3 | in_progress | 已实现定时鉴权错误聚合、独立告警配置、用户绑定解析和 outbox 幂等入队。基线 30 项测试通过；新增回归断言先出现 8 项预期失败，实现后 53 项针对性测试通过。首次构建输出至 `/tmp/octo-devops-auth-notification-build` 通过。 | 最终差异及文档检查中；未部署。 |
| 2026-11-02 | v3 | done | 53 项针对性测试通过，最终 Server 构建通过；本地/示例配置解析断言、文件引用和 diff 检查通过。生命周期及平台同步说明已补充字段、接收人解析、开关、去重和生效边界。保留工作区原有不相关变更。 | 新版代码及本地配置尚未部署或重启；本轮未发送真实自动通知。部署后若当前会话仍失效，启动首轮可以产生首条自动告警，历史人工通知不作为自动流程的去重基线。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| v1 静态检查 | 已核对 | adapter 的 401 映射、环境缓存与 controller 降级分支；Server 启动时读取会话配置 | 当时未改变代码；不证明浏览器当时的具体显示内容 |
| v1 已有运行日志 | 已确认三环境鉴权失败 | 上述当日日志的时间、环境、status、msg 安全字段 | 日志成功指环境刷新完成，不等于每个 PR 都存在构建 |
| v1 Live 上游只读验证 | 已复现三环境 401 | 从 server 目录以 `node --input-type=module` 运行临时内联脚本，调用 `dist/adapters/odoo-devops/odoo-devops-branches-client.js` 的真实客户端 | 首次沙箱内请求未获得 HTTP 响应，不能用于判断上游；允许网络访问后的复验才获得 401 |
| v1 单测 / 构建 / 浏览器 E2E | 未运行 | 仅诊断及任务文档新增 | 当时没有业务代码改动；未验证登录恢复后的页面 |
| 配置更新 / 重启 / 恢复验证 | 未执行 | — | 需要有效 DevOps 会话后再处理 |
| v2 实际消息发送及 read-back | 通过 | 现有发送器将本次 outbox 标记 sent；Lark 消息回读校验目标群和 Ben Lin 的真实 mention | 仅一条本次人工通知，未验证阅读状态；无代码或自动调度改动 |
| v3 单测 | 通过 | scheduler 鉴权分类/聚合/失败重试；JSON 默认关闭、群继承、接收人及非法配置；应用服务多接收人、转义和绑定缺失 | 测试身份为合成数据，无真实消息发送 |
| v3 Mock integration | 通过 | `pnpm --dir server test src/application/services/odoo-devops-auth-notification.service.test.ts src/application/services/odoo-sh-build-refresh-scheduler.test.ts src/application/services/message-delivery-worker.integration.test.ts src/scripts/platform-sync.test.ts`，共 53 项 | pg-mem outbox + 真实 scheduler/消息准备/发送服务，Lark sender mock；验证同会话跨重建去重、新会话可通知及原投递失败策略 |
| v3 本地配置解析 | 通过 | 真实源码配置解析器读取本地及示例 JSON：本地启用、目标为既有群、接收人 `uynil`，示例保持关闭 | 本地 JSON 被 Git 忽略，需在目标环境保留或另行部署；未重启运行中 Server |
| v3 构建及静态检查 | 通过 | `pnpm --dir server build --outDir /tmp/octo-devops-auth-notification-build`；`git diff --check`；任务引用路径存在；新增服务无 `console.log` 或临时 debug 标记 | 编译输出未写入运行中 Server 的 dist，未触发 PM2 watch；无新的依赖或数据库结构变更 |
| v3 Live E2E / 已部署运行时 | 未执行 | 无部署、重启或测试消息 | 旧人工通知的成功不能证明新版自动流程已生效；上线后应在实际失效时确认 outbox 与 Lark read-back |

## 关联

- [历史 Odoo.sh 显示诊断：网络失败与鉴权失败的区分](../engineering-ops/2026-09-10-odoosh-build-hosts-pin-diagnosis.md)
- [状态读取和失败冷却设计](../platform-data/2026-09-24-odoo-build-request-volume.md)

复用已有 [ERR-20260910-003](../../../.learnings/ERRORS.md#err-20260910-003--hosts-钉死失效-ip-导致-odoosh-全环境请求失败) 的日志分层规则，不重复增加学习条目。
