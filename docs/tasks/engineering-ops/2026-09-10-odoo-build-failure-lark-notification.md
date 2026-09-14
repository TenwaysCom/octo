---
title: "Odoo.sh 新失败 build 群通知并提醒 head commit 作者"
module: "engineering-ops"
status: in_progress
requirement_version: 5
created_on: 2026-09-10
updated_on: 2026-09-12
closed_on: null
owner: Yu LIN
related: []
---

# Odoo.sh 新失败 build 群通知并提醒 head commit 作者

## 目标

Octo 从 Odoo DevOps 获取 Odoo.sh build 数据后，发现新的失败 build，向指定 Lark 群发送一条通知；按用户配置的 head commit 作者别名映射 GitHub 账号，再查询唯一有效 Lark 绑定并 @。缺作者或绑定时仍发消息、不 @。

## 初始背景与范围（v3，后续变更见 v4 / v5）

- 当前 `server/src/application/services/odoo-devops-branches.service.ts` 在 `fetchAndCache` 获取快照，默认缓存 30 分钟；请求可触发刷新，不是独立定时监控。
- 当前 `server/src/modules/odoo-devops-branches/odoo-devops-branches.dto.ts` 仅保留 branch、stage、last_build_status、last_build_result、odoo_branch，不能据此区分连续失败的不同 build。
- 本地 Odoo DevOps 源码 `backend/odoo_devops/infrastructure/odoo_sh/http_gateway.py` 从 last_build_id 提取 database_id，但存在回退到分支 id 的逻辑；不能将此字段直接认定为可靠 build id。分支响应没有 commit SHA 和推送人。
- Octo resolved-user-store 已有 githubId 和 larkId 字段；真实推送人是否有可用且唯一的身份绑定仍需验证。
- Meegle Lark push service 已有群发消息与 open_id mention 格式，可复用 adapter 能力。
- 本次只覆盖获取快照后实际观察到的 build；独立轮询、完整 build 历史补采、成功恢复通知不在当前范围。仅取最新 build 可能漏掉两次刷新之间被后续 build 覆盖的失败。

## 方案与决策

以下为 v3 历史方案；身份与接口部分已由下方 v4 决策替代：

1. 在服务端新快照获取并校验成功后触发检查；缓存读取不重复触发外部通知。
2. 从上游取得明确 build id、项目身份、commit SHA、build 链接和实际推送人的稳定 GitHub 身份。具体字段与失败枚举必须通过上游契约及脱敏样本验证，不能猜测。
3. 用 environment + project id + build id 作为持久化去重键；同一 build 从运行中变为失败也应通知。相同 SHA 的重建应视为不同 build。
4. 首次接入默认建立基线，不批量补发历史失败；首次观察为运行中的 build 后续失败需要通知。此默认值在实现前需明确告知。
5. 实际推送人通过已验证身份绑定解析 Lark open_id；不得用 PR 作者、commit 作者、显示名模糊匹配代替推送人。无法解析时保留待处理记录，不把 @ 成功记为已完成。
6. 在用户指定的 Lark 群 `oc_ebad023939d64fa0b0314d03307d8d77` 发送环境、项目/分支、build id、失败结果、commit SHA、build 链接和推送人 mention。EU、UK、US 统一使用此目标群；机器人可发消息权限及人员 mention 仍需运行时验证。
7. 持久化通知状态及返回 message_id，防止并发刷新、缓存清空和进程重启后重复发送。明确发送失败可重试；发送结果不确定时先对账，不盲目重发。实现时核验 Lark adapter/API 可用的幂等机制。
8. 通知失败不破坏原有 build 展示；日志携带 actionRunId、layer、module、stage、errorCode，不保存凭据或完整敏感响应。

消息示例（占位内容，未发送）：

> @推送人 Odoo.sh build 失败
> 环境：EU｜分支：feature/example
> Build：12345｜Commit：abcdef1
> 结果：失败
> 查看 build：经上游验证的链接

### 按需增量同步与异步处理（v3）

用户明确要求本地保存 build 记录、使用信息时检查增量并同步，以及做好异步处理。以下约束细化以上方案：

- 页面读取有效缓存时直接返回，不拉上游、不重复同步。缓存过期时先返回旧快照并标记 stale，后台刷新；无缓存时返回 `202 refreshing`，前端按 retryAfterMs 有界重试，禁止持续高频请求。
- 后台按环境合并并发刷新；一次刷新依次完成上游获取、schema 校验、本地差异比较与批量持久化。前端读取不等待这一链路完成。
- PostgreSQL 保存 build 身份、分支、commit、状态/结果、推送人及首次发现/最近观察时间。唯一约束为 environment + project id + build id。仅对新增或变化的记录更新业务字段，避免逐条查询和逐条网络补全；不变记录的观察时间如需更新也批量处理。Redis 仍只负责缓存。
- “增量”指 Octo 比较上游快照与本地记录，不假定上游支持增量 API；不在每次读取时拉取全部历史。无人读取时不主动发现新 build。
- build 变为可通知的失败状态时，在同一个数据库事务中更新 build 并插入持久化待通知记录，避免状态保存成功但通知任务丢失。处理成功后再发布对应的新缓存；同步失败不把该快照标记为已同步。
- 后台通知消费者原子领取任务，在事务外解析人员与调用 Lark，再保存 message_id。持久化任务支持重启恢复；不能仅用未受管理的 Promise 或内存队列承担通知可靠性。不预设新增消息队列依赖。
- 刷新和通知分别设置超时、并发上限及失败退避。明确可重试失败采用有限重试，耗尽后保留失败原因供排查；发送结果不确定时保留待核实状态，不能靠无条件重试声称绝不重复。领取记录需支持进程中断后的恢复与对账。
- 旧刷新结果不得覆盖更新快照或回退已确认的终态；实现时结合上游版本/时间语义与实际部署进程数选择并发控制。人员映射或 Lark 故障不阻塞页面展示及 build 同步。
- 最小记录刷新/同步耗时、变化数量、待通知数量和失败阶段。超时、退避参数与可接受的读取延迟在实现验证中根据实际数据确定，不预先声称性能结果。

## 待补充

- 上游可靠 build 身份与推送人来源；当前分支响应不足，需补充上游契约后才能完整实现。若使用额外 GitHub push 事件采集，需单独确认新增范围。
  - 实现现状：build 身份暂用上游 `database_id`（Odoo.sh `last_build_id[0]`），并以"状态/结果均为空则视为从未构建"排除分支 id 回退；`commit_sha`、`pusher_github_id` 列已预留但恒为 null，推送人缺失的通知全部停留在 pending_identity，不会发送。
- 真实失败结果枚举，以及 warning 是否应通知；草案默认只处理确认的失败。
  - 实现现状：`server/src/domain/odoo-sh-builds.ts` 的 `ODOO_SH_FAILURE_RESULTS` 暂只含 `failed`（已验证 `success` 的反义）；拿到上游脱敏样本后只需修改该常量。warning 不通知。

## 验收标准

- [ ] 新 build 失败后向目标群发送，且 @ 的是该 build 的实际推送人。（mock 已覆盖 mention 发送链路；推送人身份上游缺失，真实发送未发生）
- [x] 同一 build 重复拉取、并发刷新、清缓存及进程重启均不重复通知。（mock：通知三元组唯一约束、claim 守卫、claim 过期回收）
- [x] 同一分支连续两个不同 build 失败分别发送；相同 SHA 重建可区分。（mock：以 build_id 为身份，重建即新 build）
- [x] 已观察到运行中的 build 后续失败仍通知；成功、运行中及未知结果不误报。（mock）
- [x] 首次基线不刷屏；身份缺失、发送失败和发送结果不确定均可追踪。（mock：pending_identity/failed/outcome_unknown 均持久化原因）
- [x] 上游请求或 Lark 发送保持未完成时，页面仍能立即读取有效/旧缓存，冷缓存返回 refreshing；不串行等待外部链路。（mock：getOrStartRefresh 合并刷新 + 202/stale）
- [x] 同环境并发读取合并刷新；无变化快照不新增通知，增量持久化不逐条调用上游。（mock）
- [x] build 更新与通知入队原子提交；事务失败后仍可重试，不因缓存已刷新而跳过待同步数据。（mock：单事务 applySnapshotSync + 同步失败不发布缓存）
- [x] 通知待发送时重启可恢复；超时、限流、明确失败、结果不确定和领取后崩溃分别验证，不误记已发送。（mock：限流按可重试明确失败处理，指数退避有限重试）
- [ ] 旧快照晚到不覆盖新状态；前端刷新重试有界，失败退避期间不产生请求风暴。（单进程内 refresh 合并已验证；上游无版本语义，跨进程晚到快照覆盖未解决；本端点前端消费方暂缺）
- [x] mock 服务测试覆盖上述分支；server test/build 通过。（801 passed / build ok）
- [ ] 真实群消息回读验证 message_id、build 信息和 mention；该验证与单测结果分别记录。（未执行）

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-10 | v1 | planned | 已阅读 Octo 快照 service/DTO、身份 store、Lark mention 实现及本地 Odoo DevOps 分支 mapper/response | 等待群信息；补齐 build 与推送人契约。未实现业务代码、未发送通知 |
| 2026-09-10 | v2 | planned | 用户指定统一目标群 `oc_ebad023939d64fa0b0314d03307d8d77`，替代 v1 待提供群配置 | 仍需补齐 build 与推送人契约；尚未配置运行时通知或发送消息 |
| 2026-09-10 | v3 | planned | 用户确认本地保存、按需增量同步和异步处理；补充缓存返回、后台同步、事务入队、恢复重试及并发验收约束 | 仍为需求设计，未实现或进行性能/运行时验证；上游 build 与推送人契约待补齐 |
| 2026-09-10 | v3 | in_progress | 服务端实现完成（见下）。`pnpm --dir server test` 801 通过、`pnpm --dir server build` 通过；均为 mock 集成测试，未发送真实消息 | 上游仍未提供可靠推送人/commit：全部通知入队为 pending_identity 待身份；失败枚举按默认 `failed` 实现；真实群发送、机器人权限、mention 回读未验证 |

## 历史实现（2026-09-10，v3；当前行为见 v4）

- 读取路径：`GET /api/web/odoo-devops-branches` 切换到 `getOrStartRefresh`——有效缓存立即返回（含 `stale` 标记）、冷缓存返回 `202 {state:"refreshing", retryAfterMs}`、刷新失败退避窗口返回 503；同环境并发刷新合并。快照缓存 key 升级 `v2`（新增 `project_id`、`database_id`、`connect_url`）。
- 同步钩子：`OdooDevopsBranchesService` 新增 `onSnapshotSync`，上游获取并校验成功后先同步本地再发布缓存；同步失败保留旧缓存并在退避后重试。`platform-data.service` 沿用的阻塞 `list()` 路径会同步等待本地持久化，DB 故障会传播为该页读取失败（仅异步路径承诺不串行等待）。
- 持久化：`odoo_sh_builds`（PK environment+project_id+build_id，含 branch/stage/status/result/build_url/commit_sha/pusher_github_id/first_seen_at/last_seen_at）与 `odoo_sh_build_notifications`（同三元组唯一约束，状态机 pending_identity/pending_send/sending/sent/failed/outcome_unknown）。差异比较后单事务落库并入队；不变记录仅批量更新 last_seen_at；重复快照不产生新通知。
- 基线：environment+project 首次落库只建基线，不补发历史失败；此后新增失败 build 或 running→failed 变化入队。
- 通知消费者：进程内轮询 + DB 原子领取（guarded UPDATE，attempts 领取自增）+ claim 过期回收（重试未耗尽回到 pending_send，耗尽置 failed 保留原因）；可重试明确失败指数退避有限重试；结果不确定（超时/网络/缺 message_id）置 outcome_unknown 停止自动重发待对账；推送人缺失置 pending_identity，不计重试，待上游补充身份后由 sync 唤醒。
- 发送：新增 `LarkImNotificationClient`（tenant_access_token 应用身份，im/v1/messages 带 `uuid` 幂等参数），mention 用 `<at user_id="open_id">`；推送人经 `users.github_id → lark_id` 解析（`getResolvedUserStore().getByGithubId`），不做 PR/commit 作者或姓名模糊匹配。
- 配置：`ODOO_SH_BUILD_NOTIFY_LARK_CHAT_ID`（默认 `oc_ebad023939d64fa0b0314d03307d8d77`）、`ODOO_SH_BUILD_NOTIFY_POLL_INTERVAL_MS`（30s）、`ODOO_SH_BUILD_NOTIFY_MAX_ATTEMPTS`（3）、`ODOO_SH_BUILD_NOTIFY_RETRY_DELAY_MS`（60s）、`ODOO_SH_BUILD_NOTIFY_SEND_TIMEOUT_MS`（10s）；缺 LARK_APP_ID/SECRET 时消费者不启动，通知保留待处理。
- 测试：store（pg-mem 事务/领取/回收/终态）、sync（基线/新增失败/running→failed/不变/无 build 跳过/重建区分）、consumer（mention 发送/身份挂起/有限重试/不确定结果/领取崩溃恢复/并发领取）、branches controller+service（202/stale/退避/同步失败不发布缓存）、Lark IM client 错误归一化。

## 历史验证（v3）

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态源码调查 | 已完成 | 上述具体文件 | 本地 checkout，不代表线上响应 |
| 单测 / 构建 | 已完成 | `pnpm --dir server test` 801 passed（含本任务新增 store/sync/consumer/controller/client mock 测试）；`pnpm --dir server build` 通过 | 全部为 mock/pg-mem，无真实 Lark 发送 |
| 真实消息 | 未执行 | 无 | 需机器人入群权限、推送人身份契约后回读 message_id 验证 |

## 新 builds 接口实测（2026-09-12）

- 用户确认接口已更新、取消 `limit`。使用现有服务端 Session 配置，分别只读请求 `GET /api/v1/odoo-sh/{environment}/builds`，不传查询参数；未触发 Octo 同步、数据库写入或 Lark 发送。
- EU / UK / US 均返回 HTTP 200、`Cache-Control: private, no-store`、`cached: false`；本次分别观察到 55 / 17 / 8 个分支、152 / 41 / 22 个 build。对应 project_id 为 95890 / 287053 / 193995。
- 实际结构与早期示例不同：顶层为 `environment, project_id, project_name, branch, cached, items`，没有 `total_builds`；分组为 `{ branch_info, builds }`；build 标识为 `id`，不是 `build_id`。接入时应按真实契约校验，不能直接沿用示例 DTO。
- 本次所有 build 的 `head_commit_author`、`head_commit_msg`、`head_commit_timestamp`、`head_commit_url` 均为非空字符串。观察到 result 为 `success / failed / warning`，status 为 `done / dropped`。作者显示名不等于稳定 GitHub 身份或实际推送人，不能直接用于可靠 Lark mention。
- 验证边界：未验证 branch 精确过滤、上游顺序或参数拒绝行为；未修改业务代码，现有客户端仍调用 `/branches`，缺身份仍阻塞通知。新接口可访问不代表通知已接通。

## v4：builds 接入与可配置作者映射（2026-09-12）

- 用户要求基于新接口找到 head commit 作者、对应 Lark ID 并发消息，随后明确配置映射：`jack / Jack → 13715928974`、`ytd → achieveIdeal`、`ben lin → uynil`。提醒对象变更为 commit 作者，不再要求实际 pusher。
- `ODOO_SH_BUILD_AUTHOR_GITHUB_MAPPING` 为 JSON 对象，显式配置整体替换默认映射；`{}` 禁用全部别名。作者 trim + lowercase 匹配；同一规范化作者指向不同账号时报配置错误。示例见 `server/.env.example`，修改配置需重启 Server。
- 用户绑定由 `users.github_id` 不区分大小写精确查询；仅唯一 active 且有 `lark_id` 的记录可 @。未知作者、缺绑定或冲突时正文仍发送；数据库查询故障进入有界重试。最终实现不依赖 GitHub commit API。
- 分支展示仍读取 `/branches`；缓存刷新钩子读取不带 limit 的 `/builds`，校验环境和项目一致后同步。保留全部返回 build 的上游顺序；首次建立基线不补发历史失败，之后仅各分支首项（当前 head build）的新增失败或失败转换入队。旧版本身份挂起通知仅在当前失败 head 被新快照观察时唤醒。
- `head_commit_author / head_commit_url` 独立持久化，commit SHA 从链接提取；不将作者写进 `pusher_github_id`。消息显示作者、commit 链接、环境、分支、build ID、结果、build 链接。
- Lark `uuid` 改到请求正文；由稳定通知幂等键计算 32 字符值。原 query 参数写法与本地 SDK 的正式接口类型不符。
- 真实发送范围为 Dev 群中一条 EU `dev_main` 当前失败 build `37790424`；这是用户本次明确要求发送的单条通知，不开启历史失败批量补发，也未启动常驻 Server。
- 验证：`pnpm --dir server test --maxWorkers=2 --minWorkers=1` 为 876 passed / 1 skipped；常规全量曾出现既有 ACP 审批过期时序失败，单独复跑 8 项通过。随后新增群成员权限错误处理的针对性验证 16 项通过。`pnpm --dir server build` 通过；`git diff --check` 通过。没有修改无关 ACP 测试。
- 数据库实证：使用当前 Server 配置的 PostgreSQL，仅执行 build 通知两表的专用建表/增列；EU 首轮保存 152 条 build，baseline=true，自动入队 0。随后按用户本次发送要求单独入队 EU/95890/37790424，尝试发送一次。
- 真实发送受阻：目标群读回名称为 `Dev`，机器人读回名称为 `Octo Assistant`；身份解析为 `Jack → 13715928974 → Jack Zhang`。Lark 返回 HTTP 400 / code 230002 / `Bot/User can NOT be out of the chat.`，没有 message_id，不代表送达。
- 通知记录已读回为 `failed`、attempts=1、`LARK_IM_NOT_IN_CHAT`、message_id=null；停止该权限问题的自动重试。已为 adapter 和 consumer 增加 permanent 错误处理与测试。
- 待用户将 `Octo Assistant` 加入 `Dev` 群后再明确重试该条失败通知，检查新接口中的当前 build 状态，再回读 message_id 和 mention。当前未完成真实消息成功验收；未提交、未部署、未启动常驻 Server。


## v5：每 30 分钟后台刷新与历史静默初始化（2026-09-12）

- 用户明确要求直接创建后台任务，30 分钟刷新三个平台；本任务指 EU / UK / US 三个 Odoo.sh 环境。初始化时接口返回的全部历史 build 只保存、不发消息。
- `OdooShBuildRefreshScheduler` 随 Server 启动，立即执行一次，之后每 1,800,000ms 执行一轮。每环境强制刷新 branches 缓存并读取 `/builds`，不依赖页面访问或缓存是否过期。单个环境失败被独立记录，下一轮重试；同进程轮次不重叠。
- 页面读取与定时任务共用 `OdooDevopsBranchesService.refresh()` 的每环境 in-flight Promise；防止两个入口并发抓取、落库同一环境。服务关闭时停止 timer 并等待正在执行的刷新，仍受 Server 的整体关闭超时保护。
- 新增 `odoo_sh_build_sync_state`，按 environment + project_id 保存初始化标记，与首次快照写入同事务提交；即使首次没有 build，也持久化初始化状态。升级旧库首次建标记时仍只保存历史，不因数据已存在而补发失败。
- 初始化后的每轮检查所有返回 build，而非仅分支首项：新增失败或已记录的非失败转失败入队；历史失败不因作者元数据变化重新入队，重复快照由通知唯一键去重。提醒仍沿用 v4 的可配置作者映射。
- 真实初始化：EU 152、UK 41、US 22，共 215 条。EU 复用已有记录，UK/US 新建；三环境 baseline=true、notificationsQueued=0；初始化前后通知记录完全相同，保留此前单条失败测试记录，未发送历史消息。初始化标记已从 PostgreSQL 读回。
- 验证：针对性 27 passed；全量 `pnpm --dir server test --maxWorkers=2 --minWorkers=1` 为 885 passed / 1 skipped；`pnpm --dir server build` 与 `git diff --check` 通过。覆盖定时边界、启动/停止、失败隔离、重叠轮次、强制刷新、空基线、重启与非 head 新失败。
- 运行证据：已通过 `pnpm --dir server start` 启动本地 Server（3040），23:35:36 日志确认 `intervalMs=1800000`；23:35:39 三环境首次周期全部 completed，后续周期由此进程继续执行。未等待真实 30 分钟间隔；该间隔经假时钟测试验证。未提交或远程部署。
- 运行边界：此为本地 Server 进程内定时任务，依赖进程运行与主机唤醒；未提供跨实例调度锁。Lark 成功送达仍未验证，上次真实发送因 Octo Assistant 未加入 Dev 群而被拒绝，记录为 failed，不自动重试该旧记录。
- 本轮边界复核：不能用 build 表是否有行替代初始化标记，否则空项目会重复初始化、升级旧库会误报；已通过持久化状态及针对性测试约束，不另行重复写入 Learning Ledger。

## Review 修复（2026-09-12）

- 对应本轮四项发现：通知 timer 丢弃拒绝 Promise；过期 sending 自动重发；发送前 token 网络故障误判为 outcome_unknown；业务 import 早于 dotenv 导致日志配置提前固定。
- 定时消费入口捕获并记录轮询异常，保留单轮清理与下一轮重试；数据库领取、枚举和状态写回异常均不再导致未处理拒绝退出 Server。
- 过期 sending 原子转为 outcome_unknown，不论尝试次数均不自动重发；Lark UUID 只有一小时去重窗口，不能作为宕机恢复的无限期保证。未区分发送前阶段的旧领取一律保守待核实。
- 发送已确认但 markNotificationSent 写回失败时，也禁止重新入队；可写入时将返回 message_id 与 ODOO_SH_NOTIFY_ACK_FAILED 一并保留用于核实。整个数据库持续不可用时记录保持 sending，恢复后由过期处理转为待核实。
- 获取 tenant token 的网络异常返回 retryable / LARK_TENANT_TOKEN_REQUEST_FAILED；只有实际发送请求的未知结果才停止自动重试。
- reflect-metadata 与 dotenv/config 恢复到入口最前方；隔离子进程从实际 index.ts 启动，验证自定义 .env 的 LOG_LEVEL=debug 确实在 logger 创建前生效。
- 验证：针对性 33 passed；全量 `pnpm --dir server test --maxWorkers=2 --minWorkers=1` 894 passed / 1 skipped；`pnpm --dir server build`、`git diff --check` 通过。未执行真实发送或修改历史通知。
- 运行验证：已优雅重启本任务此前启动的本地 Server，健康接口返回 200；新进程 PID 54374 确认 1,800,000ms 定时任务启动，EU/UK/US 首轮全部 completed，baseline=false、notificationsQueued=0。未提交或远程部署。
- 根因复核：发送前失败、远端发送结果、本地确认写回是三个不同阶段；Promise 的 void 调用也不等于异常隔离。已在上述故障边界加入可执行回归测试，不另写重复的 Learning Ledger 规则。

## 关联

- `docs/ai-dev/lifecycle/current-system-technical-objects.md`
- `docs/ai-dev/rules/system-boundaries-and-code-rules.md`
- `docs/ai-dev/rules/server-code-rules.md`
