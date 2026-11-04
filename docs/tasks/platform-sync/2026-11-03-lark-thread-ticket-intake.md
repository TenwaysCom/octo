---
title: "Lark 群话题自动登记 Ticket"
module: platform-sync
status: done
requirement_version: 6
created_on: 2026-11-03
updated_on: 2026-11-04
closed_on: 2026-11-04
owner: Codex
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# Lark 群话题自动登记 Ticket

## 目标

在独立 platform worker 中扫描指定群的新话题，创建 Lark Base record，单条同步及清洗至 Octo，立即执行既有 shadow AI，生成并回写合适标题，再在线程内确认“已记录工单 / title：… / 编号：…”，最后在根消息添加 +1 表情。

## 验收标准

- [x] v6：明确未执行的创建/回帖拒绝可从原阶段重试；连续五次失败停止自动重试，修复后可单条人工重试；超时、5xx、未知结果继续禁止自动重发（本地 mock）。
- [x] v6：HTTP 省略追踪 ID 时由入口生成，贯穿扫描与错误响应；自动扫描的 coordinator、adapter 及失败日志使用同一扫描 ID，并关联持久化的单工单执行 ID（本地 mock）。
- [x] v5：说明自动 Worker 和手动区间入口；以 Application Bot 预览北京时间 2026-11-03 19:15:00 至 19:18:00 的指定群话题（半开区间），仅扫描，不创建、回帖、加表情或推进自动游标。
- [x] v4：话题读取、Base 创建及标题更新、同步读取、shadow 上下文、回复和 +1 统一使用 Application Bot（tenant token），不依赖 Ben Lin 的用户授权。
- [x] v4：用原测试话题验证应用权限及实际发送身份；用户随后清理相关测试数据，按该话题重新创建并验证 Bot 全链路。真实批量仍不执行。
- [x] 群 `oc_01f7302959b7723a026f21daae6c622b` 的用户新话题均为工单；回复、机器人及系统消息不另行建单（本地 mock）。
- [x] 首次启用从启用时点开始扫描；后续持久化游标、分页与重叠扫描去重，分页失败不推进水位（本地 mock）。
- [x] 已有 Base 工单按源 thread 去重；创建、分析、标题、确认消息、表情有持久化进度，部分失败可恢复（v6 已补明确拒绝恢复回归）。
- [x] 立即分析新工单，不受既有 shadow worker 的三小时 settle 限制；分析不写正式 ticket_ai（本地 mock）。
- [x] 确认使用 Base 实际生成编号和回读标题，确认发送后才添加 JIAYI（+1）表情（本地 mock）。
- [x] 提供指定单条源消息的受控入口，不触发扫描/批量创建。
- [x] 批量入口接受显式起止时间，支持按区间手动测试；不改写正常扫描游标，不夹带区间外工单。
- [x] 静态检查及聚焦 mock 测试通过（v6 修复后重新验证；既有入口 env 子进程用例失败单列下文）。
- [x] 真实单条验证：仅测试用户提供的 thread `7703902781853159175`，完整链路及重复提交通过；真实批量测试由用户自行执行。

## 背景与范围

现有 Base → Octo 增量同步与 shadow AI 保留。用户已确认指定群内所有话题均为工单。只在 server/adapter 增加入口，无 FE/extension 变更。v3 用户授权以所给单条话题执行真实创建、同步、AI、标题回写、确认及表情测试；允许必要授权刷新及本任务状态表初始化。v4 要求 Application Bot 身份，用户随后清理旧测试数据；只对同一话题重新创建验证，确认旧记录在 Base absent 后定向重置该话题的一条完成状态。不执行真实批量创建、应用整体迁移、部署或进程重启。工作区已有未跟踪 `scripts/grant_luna.sh`，不属于本任务。

## 方案与决策

- 配置沿用 platform-sync 文件和 scheduler 总开关，新增任务默认关闭，源群显式关联已配置 Base/Table；不推断其他群。
- 新增 PostgreSQL 扫描游标与分阶段登记记录，复用既有 coordinator 的 scope lease；创建/回帖结果不确定时保留人工核实状态，不盲目重发。
- v4：登记流程使用既有 LARK_APP_ID/LARK_APP_SECRET，SDK 获取和缓存 tenant token；复用单条同步及 shadow provider，注入应用客户端。既有其他同步任务的用户授权不变。标题从脱敏源问题及 shadow 结果生成并校验。
- 单条入口必须指定群与消息 ID，不读群历史列表、不推进扫描游标。
- v2：去重权威为 Base 的 `Lark Message Link` 中的 `threadid`；区间入口接受起止时间，独立于自动扫描游标。v1 仅有自动游标与单条入口的方案已被补充，区间验收重新打开。
- v3：用户提供 AppLink（threadid `7703902781853159175`、链接 chatid `7538726794547986470`）授权单条真实测试。先核实客户端数字 ID 与 Open API 标识关系，再沿同一流程执行，不扩大为群历史创建；相关单条入口与去重验收重新打开实测边界。
- v4：仅登记运行时切换为 Application Bot；worker、单条 CLI 和区间 HTTP 入口不再要求个人 master user。共享同步/shadow 接口中的 masterUserId 使用内部应用标识并注入应用客户端，不能回退为个人令牌。已完成登记的正常重复输入仍直接返回原结果；本次旧测试记录被用户清理后的单条状态修复不增加重置接口或自动重建行为。
- v5：用户要求指定时间段模拟测试，仅执行既有 scanRange(apply=false)；沿用隔离配置，不启动 Worker，不执行真实批量创建。当前该能力提供 Worker 与 HTTP API，现有 Sync Status 页面尚无该话题登记区间按钮。
- v6：修复 PR #183 review 的两项 P2。平台明确未执行的拒绝恢复 pending/titled，并保留失败次数及稳定幂等标识；不确定写入仍保留人工核实边界。源扫描追踪 ID 与工单持久化 ID 分层，通过 parentActionRunId 关联，不把重试改成新工单。本次只执行本地回归，更新既有 PR，不进行真实批量、部署或运行状态修复。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-03 | v1 | in_progress | 已核查现有 worker、Base 同步、thread context 与 shadow 流程；用户确认群范围。 | 实施与本地 mock 验证；真实单条工单尚未提供。 |
| 2026-11-03 | v2 | in_progress | 用户明确以 Base message link 的 thread ID 去重，并要求批量入口支持起止时间区间。已复核配置、扫描、去重及验证范围。 | 增加区间入口及对应 mock 测试，不执行真实批量。 |
| 2026-11-03 | v2 | in_progress | 实现 worker 任务、单条 CLI、受 Web session/platformSync 保护的区间 HTTP 接口及持久化状态。Base 去重读取实际链接 URL；补齐新话题无回复时的根消息上下文和超链接 URL 清洗。13 个聚焦文件 191 个用例通过，Server build 通过。 | 尚未配置/启用运行实例；真实单条待用户提供，真实批量由用户执行。 |
| 2026-11-03 | v2 | in_progress | 路由注册与权限中间件验证通过。完整 index.test 的 env 加载子进程用例在 Vitest 下 stdout 为空；用 HEAD 的 index.ts/index.test.ts 临时副本在相同环境复现相同失败，独立子进程加载当前及 HEAD 入口均输出预期日志级别；临时文件已清除。 | 保留该既有失败，不修改无关启动测试；不将独立本地 smoke 称为部署验证。 |
| 2026-11-03 | v2 | in_progress | 用户询问当前 Base 创建权限。只读检查确认 worker 身份、Lark 应用及一个 Base target 已配置，指定群的 intake source 尚未配置；数据库存在 active Lark 授权记录，但当前 access token 已过期，保有刷新凭据。 | 本轮未刷新令牌、未创建记录，未调用需有效 token 的 Base 权限接口；不能据此确认或否定实际创建权限。 |
| 2026-11-03 | v3 | in_progress | 用户提供单条 Lark 话题并要求创建测试；已更新授权与验证范围。 | 解析源消息、核对去重及权限，再只执行此条；不启用自动任务。 |
| 2026-11-03 | v3 | in_progress | 已刷新既有授权，读取指定话题确认属于配置群，根消息为 `om_x100b61a862f804a4ff7e147e0d79953`，canonical thread 为 `omt_198c4a0a7e8f585b`。实测暴露数字/Open ID 别名与 AppLink 参数问题，补齐 `--thread-link`、双标识去重和规范链接。 | 只读取此话题消息及 Base 链接列，未扫描创建其他工单。 |
| 2026-11-03 | v3 | in_progress | 一次非法 get-message 请求触发 SDK 默认 Axios 错误日志并输出授权头。已显式注入安全 SDK logger、补 stdout/stderr 回归；通过现有刷新流程更新凭据，并只读验证旧访问令牌返回 code 99991668、新令牌读取 Base code 0。 | 不在账本保存原始错误、令牌或授权头。本地修复未部署到现有进程。 |
| 2026-11-03 | v3 | done | 隔离配置仅含指定群/既有 Base target，scheduler 和 intake 均关闭。单条真实执行到 done，创建 `reczz28VBl5wd3Kx`，工单编号 **2458**，actionRunId `7deb3933-3ca3-49ae-a81b-2d6dd90ffa90`。Base/Octo 标题编号、shadow=ok、线程确认及自己的 JIAYI 均读回；同一输入再次执行仍返回原记录/同一 actionRunId，线程中匹配确认恰好一条。最新 13 个聚焦文件 196 用例、Server build 通过。 | 批量创建由用户自行测试；未部署、未启用自动任务、未重启进程。 |
| 2026-11-04 | v4 | in_progress | 用户先选择复用 2458 验证更新/回复/表情，随后说明相关数据已清理。Bot 只读预检通过 Base 字段、原话题及根消息，身份为 Octo Assistant；旧 record 返回 1254043。 | 核实单条记录已删除及本地残留状态，再按原话题重新创建；不处理其他工单。 |
| 2026-11-04 | v4 | in_progress | 用户要求从 Ben Lin 切为 Application Bot，并用同一话题再次测试；重新打开身份与真实单条验收。已定位统一客户端及各入口，开始切换 tenant 鉴权，不启用自动扫描。 | 先核实应用权限；记录 2458 的创建人不可通过更新变更，重测方式已询问用户。 |
| 2026-11-04 | v4 | done | Application Bot 为 Octo Assistant；确认 2458 已不存在后，只定向重置该话题旧登记行（匹配 source/thread/旧 actionRunId/record/stage），生成新 actionRunId `39f0aa21-a15a-46c2-be1c-0b00aaee5127`。Bot 单条执行到 done，创建 `reczz28VR7opodHM` / 编号 **2462**；创建/修改审计为 Application Bot，线程回复 sender_type=app 且 sender.id 与当前 appId 一致，应用自己的 JIAYI 存在。Base/Octo 标题编号和 shadow=ok 均读回；重复提交返回相同记录与 actionRunId。14 文件 201 用例及 build 通过。 | 本次只创建这一条，未执行真实批量、部署或自动任务。 |
| 2026-11-04 | v5 | in_progress | 用户询问后台入口并要求 20261103 19:15–19:18 模拟测试；明确按 Asia/Shanghai、apply=false 扫描指定群。已核对 Worker 开关、路由与预览分支，复用上次构建及隔离配置。 | 执行真实 Lark 区间读取并核对候选与登记/自动游标未变；不做真实批量创建。 |
| 2026-11-04 | v5 | done | 使用已构建 Bot 运行时调用 scanRange，起止为 `2026-11-03T19:15:00+08:00` / `2026-11-03T19:18:00+08:00`、apply=false、maxTickets=50，actionRunId `a6f200de-72cc-400d-94fa-2baf0e13a1fa`。matched=1，候选为原根消息 `om_x100b61a862f804a4ff7e147e0d79953` / thread `omt_198c4a0a7e8f585b`，创建时间 19:17:23.385（北京时间）；results=[]。 | 来源登记行及自动扫描状态执行前后完全一致；临时脚本另行阻止 Base 创建/更新、回帖、表情调用。仅 coordinator 运行审计/租约沿既有机制更新。未验证已部署 HTTP、未启用 Worker、未真实批量创建。 |
| 2026-11-04 | v6 | in_progress | 用户要求修复 review 问题；重新打开失败恢复、追踪 ID 和本地检查验收。已复核错误类型、状态 CAS 与各入口。 | 补明确拒绝/未知写入/五次失败/追踪关联回归，再更新 PR；不进行真实平台写入。 |
| 2026-11-04 | v6 | done | adapter 保守识别明确拒绝，创建/回帖恢复 pending/titled；CAS 原子保存错误、阶段和累计失败次数，派发保留次数与原幂等标识。HTTP 默认生成并规范化 actionRunId；源扫描 ID 贯穿 coordinator/adapter/失败日志，工单通过 parentActionRunId 关联扫描。新增 23 个回归场景，14 文件 **224 用例通过**，Server build 与 diff check 通过。 | 覆盖 403/平台限流恢复、五次上限及人工重试、超时/408/5xx/未知不重发、状态 CAS 和追踪关联。只作本地验证，既有 outcome_unknown 不自动恢复；未真实批量、部署或迁移。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 通过 | `pnpm --dir server build`；`git diff --check` | 只验证本地代码；无 FE/extension 变更 |
| 单元测试 | 通过 | 下列聚焦组合的 DTO/controller、adapter、配置、shadow、thread、同步与 CLI 用例 | 平台协议及 provider 均为 mock |
| Mock integration | 通过 | intake service 34 用例；store 3 用例；应用身份 factory 2 用例；adapter 21、controller 15 用例；最新聚焦组合共 14 文件 / 224 用例 | pg-mem 验证分支/CAS，不等于真实 PostgreSQL 锁交错或 live Lark |
| 路由注册 | 通过 | `pnpm --dir server test src/index.test.ts -t 'index routes'`：3 通过 | 该命令只选路由用例 |
| 既有入口 env 回归 | 失败（基线同样失败） | `pnpm --dir server test src/index.test.ts`：`expected '' to contain 'ENTRY_LOG_LEVEL=debug'`；HEAD 临时副本相同 | 不是本次引入；独立 child smoke 成功不能冒充该 Vitest 用例通过 |
| Live 单条 | 通过 | v4：同一话题 → Bot 创建 `reczz28VR7opodHM` / 编号 2462；下列 read-back 证据。v3 的 2458 为历史用户身份测试，已由用户清理 | 只测试指定话题；未作真实批量测试 |
| Live 区间预览 | 通过 | v5：北京时间 2026-11-03 [19:15:00, 19:18:00)，Bot scanRange(apply=false) 命中 1 条原测试话题；results=[]，登记/游标未变 | 调用本地编译服务读取真实 Lark；未调用已部署 HTTP；预览不判断 Base 去重，不等于待新建数 |
| Live 批量 | 不执行 | 用户明确自行测试 | 不启动新任务或批量 CLI |
| 部署运行时 | 未执行 | 单条测试直接执行本地编译代码；仅初始化两张 intake 状态表及源链接列 | 未部署到常驻进程、未启用自动扫描、未进行全应用迁移或重启 |

聚焦组合命令：

```bash
pnpm --dir server test \
  src/application/services/lark-thread-ticket-intake.factory.test.ts \
  src/application/services/lark-thread-ticket-intake.service.test.ts \
  src/adapters/postgres/lark-thread-ticket-intake-store.test.ts \
  src/modules/platform-sync/lark-thread-ticket-intake.controller.test.ts \
  src/scripts/create-lark-thread-ticket.test.ts src/scripts/platform-sync.test.ts \
  src/adapters/lark/lark-client.test.ts \
  src/application/services/lark-ticket-cleaning.test.ts \
  src/application/services/lark-ticket-thread-context.service.test.ts \
  src/application/services/lark-ticket-shadow-summary.service.test.ts \
  src/application/services/platform-sync.service.test.ts \
  src/scripts/platform-sync-worker.test.ts \
  src/application/services/platform-sync-worker.test.ts src/http/api-auth.test.ts
```

## 待验收场景与部署

| 前置与操作 | 预期 | 当前证据 |
| --- | --- | --- |
| 隔离 source 绑定已有 Base/Table、应用权限及 AI provider；用户 AppLink 通过单条 CLI `--thread-link … --apply` 执行 | 只创建该条，Octo 可见 shadow/新标题，线程确认编号/标题，根消息 +1 | Mock 与 Bot 真实单条均通过 |
| 对同一单条输入再次执行 | 不增加 Base 记录及确认消息 | Mock 与真实单条均通过；同记录/同 actionRunId，确认计数 1 |
| 用户提交时间区间，先 apply=false，再 apply=true/maxTickets=1 | 预览给出候选；只处理区间内至多一条，自动游标及其他待办不变 | Mock 通过；v5 真实区间预览通过，实际区间创建交由用户 |
| 分析或标题失败后单条重试；表情失败后单条重试 | 保留已建单，继续未完成阶段；不重发成功确认 | Mock 通过；真实未执行 |
| 创建或回帖先被限流/权限拒绝，再恢复；连续拒绝五次 | 恢复原阶段，沿用原幂等标识；第五次后自动停止，手动单条仍可续跑；已成功步骤不重复 | v6 Mock 通过；未制造真实平台拒绝 |
| 创建/回帖超时、408、5xx 或未知平台结果后重试 | 进入人工核实边界，不自动重发 | v6 Mock 通过；未制造真实未知写入 |
| HTTP 请求不带 ID 后扫描失败，或自动扫描权限拒绝 | 响应/审计/adapter/扫描失败日志 ID 一致；单工单执行关联 parentActionRunId | v6 Controller/service mock 通过；未验证部署日志 |
| 普通 dev 或未登录调用区间接口 | 403 / 401，不调用扫描或写入 | Controller mock 通过 |

v4 Application Bot 单条真实 read-back（当前）：

- 标题：`测试工单：验证工单自动同步功能`；编号 **2462**；record `reczz28VR7opodHM`。Base 标题与登记标题一致，Octo 快照标题/编号与 Base 一致；`shadow_ai.status=ok`。
- Base 的 `created_by` 和 `last_modified_by` 均确认 Application Bot；确认消息 `om_x100b619ddca7a8acffa9cea7fd59200` 的 `sender_type=app`、sender.id 与当前 appId 一致，thread 和正文匹配；该编号/标题的 Bot 确认计数为 1。
- 根消息 JIAYI 列表 code 0，`operator_type=app` 且 operator_id 为当前 appId 的 +1 存在。
- 同一单条 CLI 再次执行，返回同一 record/actionRunId、done，无新建或重发。测试配置仍关闭 scheduler 与 intake 自动开关。

v3 用户身份单条真实 read-back（历史，记录已由用户清理）：

- 标题：`测试工单：验证工单自动同步功能，无实际业务问题`；编号 `2458`。Base 返回标题与登记标题一致，Octo 快照标题/编号与 Base 一致。
- `shadow_ai.status=ok`；源链接解析为 canonical thread；确认消息 `om_x100b61a81569a4a0ffe6eb52b7e77a6` 的 thread 与正文均匹配该工单，完整话题分页中匹配确认计数为 1。
- 根消息 JIAYI 列表只读查询 code 0，当前授权用户的 +1 存在。
- 单条及重复执行命令：`node dist/scripts/create-lark-thread-ticket.js --chat-id oc_01f7302959b7723a026f21daae6c622b --thread-link 'https://applink.larksuite.com/client/thread/open?threadid=7703902781853159175&chatid=7538726794547986470&thread_position=1' --config /tmp/octo-lark-single-20261103.json --apply`（server 包目录）。该临时配置不含凭据，两个调度开关均关闭，batchLimit=1。

尚未部署、修改常驻运行配置或重启进程。单条测试按用户授权完成必要的两张 intake 表初始化及可选源链接列；未执行全应用 schema 初始化或重置。v4 仅定向修复已由用户清理的那条旧测试登记状态，新工单 2462、shadow、Bot 确认消息及表情保留供用户验收。自动任务默认关闭，单条及手动区间不依赖自动开关。发布时需构建 server、确认状态表、实际 source 和应用权限，再由用户启用；批量测试仍由用户执行。具体配置与接口示例只维护在同步运行说明。

## 关联

- [同步运行说明](../../tenways-octo/it-platform-sync.md)
- [PR #183](https://github.com/TenwaysCom/octo/pull/183)
