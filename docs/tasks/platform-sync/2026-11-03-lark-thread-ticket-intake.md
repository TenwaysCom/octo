---
title: "Lark 群话题自动登记 Ticket"
module: platform-sync
status: done
requirement_version: 15
created_on: 2026-11-03
updated_on: 2026-11-23
closed_on: 2026-11-23
owner: Codex
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# Lark 群话题自动登记 Ticket

## 目标

在独立 platform worker 中扫描指定群的新话题，创建 Lark Base record，单条同步及清洗至 Octo，立即执行既有 shadow AI，生成并回写合适标题，再在线程内确认“已记录工单 / title：… / 编号：…”，最后在根消息添加 +1 表情。

v14：新建 Ticket 的描述只保存源消息正文，话题链接单独写入 `Lark Message Link`，不再在描述末尾重复拼接。此调整仅改新建 payload，不清理历史描述。

v15：用户授权重新构建 server、重启生产 platform worker，并补完 actionRunId `9848f89a-47ec-4968-80f0-e48f33cf543e` 对应话题。恢复编译版 ID 解析方法后，沿既有登记、租约及幂等流程完成建单、AI 分析、标题、话题回复和 +1，并读回生产结果。

## 验收标准

- [x] v15：server 构建和相关回归通过，实际编译版提供 `resolveClientThreadId`。
- [x] v15：生产 Worker 重启后 online，运行日志确认话题任务已启动。
- [x] v15：指定话题的原登记到达 done，Base 建单和 Octo shadow=ok，标题编号一致，原话题恰好一条 Bot 确认，根消息存在该 Bot 的 +1。
- [x] v14：新建描述与源消息正文一致，不再追加话题 URL；独立 `Lark Message Link` 的真实 URL 保留，相关 mock integration 与构建通过。
- [x] v13：用户已授权修复 v12 盘点的 18 条历史 message link。逐条验证话题/群/根消息后，只回写 Lark Message Link 为数字 Lark 链接；回读确认并同步本地快照，保留 Issue 类型及 AI 数据。
- [x] v13：记录逐条结果与剩余旧前缀数量；保留可恢复的旧链接计划，不创建/删除工单、不回帖/加表情、不重启 Worker。
- [x] v12：只读统计当前 Ticket 表中 `https://applink.feishu.cn/client/thread/open?` 前缀的历史链接数量及 Issue 类型，核对本地快照和实时 Base；不执行历史修复。
- [x] v11：新建 Ticket 使用数字 `thread/open?threadid=…&chatid=…&thread_position=0`，来源配置保存固定 clientChatId；候选数字 ID 必须经 API 核对 canonical ID、群与根消息后才能写入数据库和生成链接。`chat/open` 不作为最终方案。
- [x] v11：持久化已验证的 client_thread_id，重试/重建服务复用；校验失败不入库、不建单。保留去重和未回复新话题的根消息上下文，完成回归、构建及指定映射数据库读回；平台链接修改与部署验证单独记录。
- [x] v7：创建前复用同一 Base/Table 已有话题缓存中的数字 ID → canonical ID 映射，已缓存话题不重新调用 Lark；已知匹配优先于未解析旧链接。
- [x] v7：仅对缺失映射读取一条消息，核对来源群和 canonical ID；空结果、歧义或读取失败不能作为无重复的依据，原有幂等和续跑语义保留。
- [x] v7：相关回归及构建通过；核实用户指定 pending 行的最新状态，按单条入口处理，不执行历史批量、数据库重置或常驻进程重启。锁释放后恢复到 done，真实读回及重复提交通过。
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

- v14：删除描述字段的 URL 拼接，替代此前在描述和独立字段重复保存话题链接的行为；只调整新建 payload，沿用已有链接生成、独立字段写入、查重和后续分析流程。本轮不处理历史描述，不部署或重启 Worker。
- v13：用户明确要求修复这些历史 message link，替代 v12“只盘点、不回写”的执行范围。仅处理已盘点且仍使用旧前缀的 18 条记录；先完整预检生成旧/新链接计划，后逐条重读、防止覆盖并发链接变更，只更新源链接字段，经 read-back 成功再走现有单条同步/清洗。对不确定写入先读取实际链接，不盲目重发；不修改描述正文、分类或 AI 分析。不会重载 Worker。
- v12：用户追问历史飞书域名链接是否已处理、数量与 Issue 类型。本次只做现状盘点，按工单 record 去重并对照实时 Base；v11 的单条映射入库不算历史 Base 链接修复，不扩大为批量回写。
- v11：用户要求通过 omt 查得数字 threadid 并入库。只读核对本地 2081 个缓存样本，全部满足 `numeric = BigInt(omt 后十六进制) XOR 0x736588c9260f175c`，无歧义；这是本项目经验关系，不是官方契约。目标转换为 `7704994279696895756`，单条 API 读回 canonical/群/根消息三者一致，用户确认数字链接正确打开。采用“生成候选→API 独立验证→持久化”的实现；失配/空结果/读取失败明确停止，不把推导当作验证。新增来源 clientChatId 与 intake 可空 client_thread_id，不新建表；允许仅补当前映射，不批量改写历史 Base 链接或重启。
- v10：用户确认原数字格式能正确打开，并明确最终必须保留数字 `thread/open`。先继续官方 ID 来源、客户端 API 与本地缓存调研；采用已验证 `chat/open` 的建议 superseded，不据此修改运行时。不能把其他话题的数字 ID 套用于当前话题。
- v9：用户报告自动创建链接使用飞书域名及 Open ID 参数而无法打开，要求可正常进入原话题的 Lark 链接。用户确认两个示例不是同一话题，随后要求先查官方文档获取链接的方式，并接受研究 token 消息链接（v8 仅限数字格式的假设 superseded）。重新打开链接生成验收；旧 v3“规范链接”结论不再作为客户端可打开的证据。运行时修改暂缓，不执行历史批量修复或重启；数字格式和固定位置仅为原始样例，不作为已验证 API 契约。
- v7：用户要求修复历史查重阻塞。复用现有 `lark_ticket_thread_syncs.thread_id` 与 `messages_json.messages[].threadId`，按 Base/Table 读取已验证映射并先完成本地匹配；只有缺失映射调用单条话题读取，新读映射继续沿用现有进程缓存。不新增表、字段、配置或后台历史补录任务。当前 Base 的链接列仍是是否已有工单的权威，不能仅靠本地缓存未命中决定新建。本轮允许对用户指定单条登记做既有入口续跑；不批量建单、不重启常驻进程。
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
| 2026-11-23 | v15（提交状态核查） | done | 实时 GitHub API 确认 main 为 `24dfaa1`（PR #191，11-21 22:39:31），server/package.json 为 0.12.1。正式目录 main 为 `29ece33`，工作区版本号 0.12.2 尚未提交，14 个已跟踪修改、2 个未跟踪文件。本地 origin/main 缓存仍为 `0a7c5db`。共同祖先为 0a7c5db，本地独有 2794306/29ece33 两个提交，GitHub 独有 #189/#190/#191 三个提交；只读 merge-tree 未发现文本冲突。Shadow/KCS 部分工作区文件已与 GitHub 相同，reader/evidence/CLI 仍有差异；当前 KCS 独立运行包为 24dfaa1-4bc5e24。 | 尚未执行源码整合、Git 提交或推送。后续需保留两侧功能，整理重复或旧版工作区修改，再验证自动建单及 KCS 后统一提交、构建部署。 |
| 2026-11-23 | v15（覆盖来源追溯） | done | 已定位 11-21 20:48:24 的 KCS 图片能力发布。聊天「优化工单总结文档格式」执行 `/tmp/kcs-ship/install_octo_modules.py production`，从发布包 `0db9aa5-b876fee` 复制 9 个编译模块到生产 dist，并重载 server/worker。保留的覆盖前备份有 `resolveClientThreadId`，发布文件没有；发布清单 SHA-256 与该文件一致。构建所用提交 0db9aa5 不包含生产源码的 29ece33，按文件安装覆盖了完整 Lark client，而保留的 intake 仍调用已丢失的方法。 | 只读追溯完成；构建、复制、重载及备份内容相互印证。细节见下方覆盖来源记录。 |
| 2026-11-23 | v15 | done | 新 Worker 自动续跑原登记，11:16:25 到达 done，创建工单 **2560** / `reczz28cy1gw5fmW`，actionRunId 沿用 `9848f89a-47ec-4968-80f0-e48f33cf543e`。11:16:29 实际平台读回全部通过：shadow=ok，Base/Octo/登记标题及编号一致，数字链接正确，原话题恰好 1 条当前 App 的确认，根消息恰好 1 个该 App 的 JIAYI。11:16:46 队列为 89 done、0 待处理，Worker 持续 online。 | 已完成指定话题生产链路恢复；本轮使用当前工作区重建。 |
| 2026-11-23 | v15 | in_progress | 4 个相关测试文件共 94 用例通过，`pnpm --dir server build` 成功，实际 dist 的解析方法为 function。11:14:21 重启生产 Worker，PID 2844910 → 2357124，PM2 online，新进程已开始处理原 actionRunId。 | 等待原登记完成及平台读回。 |
| 2026-11-23 | v15 | in_progress | 用户授权重新构建、重启 Worker 和指定话题续跑，重新打开运行产物与真实链路验收。 | 先验证构建及编译版方法，再重启并沿原登记补跑，最后读回平台和数据库。 |
| 2026-11-23 | v14（自动建单故障定位） | done | 只读核对生产数据库、日志和 PM2。扫描正常推进，88 条 done、1 条 pending；新话题 10:32:43 入队，10:34、10:44、10:54、11:05 四次失败，record_id 与 client_thread_id 均为空，actionRunId `9848f89a-47ec-4968-80f0-e48f33cf543e`。当前 `dist/adapters/lark/lark-client.js` 缺少 `resolveClientThreadId`，现有 intake 仍调用它，最小执行复现 TypeError。源码保有该方法；针对同一真实根消息只读验证，编译版调用失败，源码版成功解析并通过 canonical/群/根消息校验。PM2 Worker PID 2844910 online，11-21 20:48:32 启动，入口为当前 server/dist。 | 本轮完成定位，故障在创建前的话题链接 ID 解析。编译文件 mtime 为 11-21 20:30:17，具体覆盖来源未追溯。首次只读读取源消息遇 Lark HTTP 504，再次读取及源码解析成功。尚未重建、重启或补跑，后续步骤尚未验证；待重新生成一致产物、加载并单条恢复。 |
| 2026-11-17 | v14（2534 单条续跑） | done | 北京时间 18:02:22 生产续跑完成。原 Base record `reczz28aebj6FrrH`、编号 2534、actionRunId `b852647f-d3c0-4cc6-93ea-7e5430533656` 均沿用。数据库读回 `done`、`shadow=ok`，Base 和 Octo 标题与登记标题一致。Lark 读回原话题恰好 1 条 Octo Bot 确认，标题和编号匹配，根消息恰好 1 个该 Bot 的 `JIAYI`。 | 已验证这条生产工单的续跑和实际平台结果。 |
| 2026-11-17 | v14（2534 单条续跑） | in_progress | 用户授权补完已创建工单 2534 的 AI 分析、标题、话题确认和 +1。复用现有单条入口，沿原 record 和 actionRunId 从已保存阶段推进。 | 先核对生产状态及 Lark 源话题，完成后读回 Base 标题、Octo 分析、同一话题的 Bot 回复及根消息表情。 |
| 2026-11-17 | v14（运行状态核查） | done | 17:58 北京时间只读核对生产日志和数据库：工单 2534 / `reczz28aebj6FrrH` 在 14:58–15:38 五次因智谱 `ZCODE_REQUEST_FAILED` / HTTP 401 停在 `created`。17:55:49 Worker 已重启，17:55:53–17:57:45 同一新 PID 的 ZCode 请求 12 次 HTTP 200，5 条其他工单 shadow 分析完成；扫描水位推进至 17:55:49。数据库共 63 条 done、1 条 created；2534 仍 attempts=5、confirmation_sent=false。 | 鉴权调用已恢复，但 2534 尚未续跑；`listPending` 只取 attempts<5，重启不会解除该条重试上限。401 不能区分旧 key 过期、撤销或配置失配；此链路使用 ZCODE_API_KEY，非 Octo HTTP 接口 key。本轮仅查询，未修改配置、重启进程或执行真实补跑；未验证重启后的新工单完整链路。 |
| 2026-11-06 | v14 | in_progress | 用户要求去掉描述末尾的话题 URL 拼接；已核对独立链接字段及去重读取，调整新建 payload 和现有创建用例断言。 | 待聚焦 mock integration、构建及 diff 检查；不写平台或历史记录。 |
| 2026-11-06 | v14 | done | 已删除描述 URL 拼接，现有创建用例同时断言纯正文描述和独立链接字段；44 个 mock integration 用例、Server build、diff check 通过。 | 仅本地代码验证；未执行 live E2E、部署或 Worker 重启，历史描述未清理。 |
| 2026-11-06 | v13 | in_progress | 已获历史 18 条链接修复授权；开始按既有快照和实时记录构造精确计划，使用实际 adapter 校验每条数字 ID。 | 完整预检后才写；不扩大到其他链接或任务。 |
| 2026-11-06 | v13 | in_progress | 18 条全部通过 canonical/群/根消息和数字 ID 的 API 预检，18 个数字 ID 唯一；已保存逐条旧/新链接计划及 AI/本地数据校验摘要。 | actionRunId `fbd73c16-1d5b-4d1e-be74-b2ab3ef908e1`；计划 `/tmp/octo-link-repair/plan.json`。下一步仅写该计划中的链接字段。 |
| 2026-11-06 | v13 | done | 18 条链接全部回写、逐条 read-back 通过、18 条单条同步/清洗和 intake 数字映射更新完成，失败 0；独立批量读回 18/18 与本地一致。实时 Base 完整 5 页与本地重新扫描，旧链接字段前缀均为 0；2257 条总记录未变。 | 写入/验证 actionRunId `fbd73c16-1d5b-4d1e-be74-b2ab3ef908e1`；残留复核 `93c0e9b0-4435-4d2e-88b6-a1a5cb21494c`。分类及 AI/本地数据摘要未变；未重载 Worker。 |
| 2026-11-06 | v12 | done | 北京时间 21:11 只读核对：当前 Ticket 表中指定前缀共 18 条，Issue 类型为问答 11、feature 5、产品信息维护 1、配置 1；实时 Base 与本地快照数量、record 集合及分类一致，全部为 Open ID 参数。 | actionRunId `34f33671-25c0-4443-bf7b-0eb847ff1751`；历史链接尚未回写，本轮无平台/数据库写入、无 Worker 操作。 |
| 2026-11-06 | v11 | in_progress | 候选数字 ID 的 API 首条消息就是原根消息，用户确认数字链接可正确打开。已开始增加 adapter 校验、映射持久化与数字链接生成；先红回归捕获旧 Open ID URL。 | 只改本地代码；单条映射写库及构建/聚焦验证待完成。 |
| 2026-11-06 | v11 | done | adapter 逐条验证候选，intake 保存 client_thread_id 并复用，生成 Lark 数字链接且定位 0；补 numeric 容器根消息识别。10 文件 154 个用例及构建通过。来源 clientChatId 已配置；仅为指定已完成工单补列并保存映射/源链接，事务提交后读回一致，原阶段/record 不变。 | 保存 actionRunId `322280bd-a07c-4293-b4fb-4e02789ae7c4`。未修改任何 Base 历史链接、未创建新工单、未重启或部署 Worker。 |
| 2026-11-06 | v10 | in_progress | 用户确认 chat/open 加 API 群内位置可定位原话题，但最终选择必须数字 thread/open，要求继续查 ID 来源；重新按此约束调研。只读缓存查询仅命中当前工单的 omt 标识，没有该话题的数字别名。 | actionRunId `8917fbc9-46dd-4437-ae24-f4db89365177`；未改业务代码、平台数据或运行进程。 |
| 2026-11-06 | v8 | in_progress | 数字源链接完整断言已复现失败：创建流程追加 Open ID 和 messageid，并强制 thread_position=1。正在核查自动入口的数字 ID 来源及域名选择。 | 尚未修改运行时逻辑，未部署或写入平台。 |
| 2026-11-06 | v8 | in_progress | 只读核对用户失败话题对应 `reczz28WLje5woXO`，登记 done、无源数字链接。根消息身份与来源群匹配；API 没有 message_app_link 或数字 ID 字段，message_position=25340、thread_message_position=-1。按用户最新要求转为官方文档调研；临时失败断言已恢复，不留下测试失败。 | actionRunId `e88cab53-b2f2-466b-b12a-88882d892ce1`；未输出正文/凭据，未修改平台或运行时。已给出按官方 CLI 规则生成的候选链接，请用户核对客户端打开结果。 |
| 2026-11-06 | v9 | in_progress | 用户允许研究 token 消息链接。官方文档/SDK 未找到专用 thread permalink 或 token 消息链接生成接口；按 CLI 规则组装的 Lark 域名、双式 Open ID 参数及 API 实际位置 -1 的候选链接经用户验证仍无法打开/跳转错误，不能作为修复。 | 正在验证 chat/open 加 API message_position=25340 的替代定位；不修改代码或历史工单。 |
| 2026-11-04 | v7 | in_progress | 已确认缓存可提供现有映射，用户要求处理；先以回归测试重现已有缓存仍读历史话题，再修改 store 查询、service 查重与 factory 注入 | 先完成本地验证，再只核对/处理指定 pending 行；没有部署或重启授权扩展 |
| 2026-11-04 | v7 | in_progress | 缓存查询、先本地后远端的两轮比较及 factory 注入已实现；新增 3 个用例先红后绿，相关 7 文件 / 74 用例通过，Server build 通过。真实只读查询缓存耗时 75ms；指定单条续跑被 `SYNC_ALREADY_RUNNING` 拒绝 | 未重启常驻 Worker；指定登记仍 pending，不能抢占有效租约，也不能宣称已部署或已建单 |
| 2026-11-04 | v7 | in_progress | 用户确认按上述流程优化；补充多工单共用同批映射、已完成登记跳过所有查重读取，以及无有效 ID 后缀不得继续建单的回归。非法 `omt_` 用例先红后绿，相关 7 文件 / 76 用例及构建通过；16:08 只读确认原锁已释放后按原登记发起单条续跑 | 等待该条执行结果及安全读回；仍不重启 Worker、不改变运行配置或批量扫描 |
| 2026-11-04 | v7 | done | 指定 thread `omt_198f5b76310f9851` 沿用 actionRunId `a54a30bc-93e9-4830-9a29-4929ff110324`，16:10:45 到达 done；创建 record `reczz28VWtNVYqSc` / 编号 **2465**。Base/Octo 标题及编号、shadow=ok、Bot 确认和应用自己的 JIAYI 均读回；重复提交返回相同 record/actionRunId/done | 仅这一条真实创建；不推进扫描游标、不批量建单、不改配置或重启常驻 Worker。此为新编译代码的真实单条验收，不能宣称常驻 Worker 已采用修复 |
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

### v15 生产恢复验证（2026-11-23）

| 类型 | 命令 / 结果 | 边界 |
| --- | --- | --- |
| 单测 / Mock integration | `pnpm --dir server test src/adapters/lark/lark-client.test.ts src/application/services/lark-thread-ticket-intake.service.test.ts src/application/services/lark-thread-ticket-intake.factory.test.ts src/adapters/postgres/lark-thread-ticket-intake-store.test.ts`，4 文件 / 94 用例通过 | 现有 adapter、service、factory、store 回归；平台调用为 mock，store 使用 pg-mem |
| 静态检查 / 构建 | `pnpm --dir server build` 成功，实际 dist 的 `LarkClient.prototype.resolveClientThreadId` 为 function | 按当前工作区构建，包含既有源码改动 |
| 已部署运行时 | `pm2 restart octo-platform-sync-worker-production`；11:14:22 新 PID 2357124 记录 scheduler_started，11:16:25 原 actionRunId 的 server.thread_ticket.done | 新 Worker 自动续跑原登记；生产 Server PID 2844623、启动时间与重启次数读回一致 |
| 真实平台读回 | Base `reczz28cy1gw5fmW` / 编号 2560；Bot 确认 `om_x100b7f0f4eb6d8a0ff9bfe054edb7a5`；shadow=ok、标题一致、回复群/话题/内容匹配、自有 JIAYI 存在，全部断言通过 | 仅验证指定话题及恢复后的当前队列，不扩展为所有同步任务的完整验收 |

### v15 编译产物覆盖来源（2026-11-23 追溯）

用户要求追查哪次构建或部署覆盖了 Lark client。操作来自聊天「优化工单总结文档格式」（`01a1f71e-5061-75a2-9f07-9e428b472492`），当时在发布 KCS 图片读取与诊断能力，对应 Octo PR #190、提交 `0db9aa516923bbe57f454794dc63bc8c0c3b60fd`。

| 北京时间 | 已核对事实 | 证据位置 |
| --- | --- | --- |
| 11-21 20:30:11–20:30:17 | 子任务 `/root/ship_fix_octo_model` 在 `/tmp/kcs-image-opt/octo` 执行 `pnpm --dir server build`，发布包中 Lark client 的 mtime 为 20:30:17.668297 | 子任务 session `01a1fe14-8221-7a62-8799-d847e05a1bc4` 的调用 `call_c46b70b3ed2c43569eca5484fc6cd8bf`；`/tmp/kcs-ship/octo-model-build.log` |
| 11-21 20:39–20:42 | `stage_runtime.py` 从上述临时工作目录复制完整 dist 到发布包；`install_octo_modules.py` 指定安装 9 个模块，列表包含完整 `adapters/lark/lark-client` | `/tmp/kcs-ship/stage_runtime.py:12`；`/tmp/kcs-ship/install_octo_modules.py:8` |
| 11-21 20:48:24 | 执行 `python3 -B /tmp/kcs-ship/install_octo_modules.py production`，随后 `pm2 reload octo-server-production --silent` 和 `pm2 reload octo-platform-sync-worker-production --silent` | 主聊天调用 `call_52b83656c51a47e28df8d4618189c04d`；回执 installed_modules=9 |
| 11-21 20:48:29–20:48:32 | PM2 确认生产 server、worker 依次重载；生产健康检查随后通过 | `/home/deploy/.pm2/pm2.log:14534`、`:14571`；主聊天读取执行 session 76148 的成功回执 |

发布目录为 `/home/deploy/.config/odoo-kcs/runtime/releases/0db9aa5-b876fee`。两份保留文件及发布清单给出了内容证据：

- 覆盖前的 `before/octo-production/adapters/lark/lark-client.js` 包含 `resolveClientThreadId`，SHA-256 为 `4dcd95bff14c2ae672c320c322fa42236a7a5f294c038d2b7ca99fc235d59167`。
- 发布的 `octo-server/dist/adapters/lark/lark-client.js` 缺少该方法，SHA-256 为 `afbed6c12e450107150fc685dce8b1bd15e7e9be233fba760e27cfa17f3cb486`，与 `before/octo-production/manifest.json` 记录的安装摘要相同。类方法对比确认本次替换新增 `downloadMessageImage`，同时丢失 `resolveClientThreadId`。
- `git merge-base --is-ancestor 29ece33 0db9aa5` 返回 1，且 `git show 0db9aa5:server/src/adapters/lark/lark-client.ts` 不包含解析方法。生产源码 HEAD 为 29ece33。发布使用了另一条提交基线，只替换编译模块，生产源码及 intake 调用方仍保留原版本。
- 安装脚本通过 `shutil.copy2(src, temp)` 保留构建文件时间，再 `temp.replace(dest)` 覆盖目标。因此此前看到的 20:30 是文件的构建时间，实际生产覆盖发生在 20:48 的安装操作。

当时的发布校验核对了复制文件摘要、PM2 online 和健康接口，没有覆盖自动建单调用链。上述来源追溯不包含新的运行时修改。

### v14 描述去重验证

| 类型 | 命令 / 结果 | 边界 |
| --- | --- | --- |
| 静态检查 | `pnpm --dir server build`、`git diff --check` 通过 | 本地编译及 diff 检查 |
| Mock integration | `pnpm --dir server test src/application/services/lark-thread-ticket-intake.service.test.ts`：1 文件 / 44 用例通过 | Lark 为 mock、数据库为 pg-mem；创建断言覆盖描述只含原文、独立链接 URL 保留 |
| Live E2E / 已部署运行时 | 未执行 | 本次仅调整本地 payload，无平台或历史数据写入；尚未重载 Worker |

### v13 历史链接修复与验证

- 修复范围为 v12 的 18 条（工单编号 2464–2481），未扩大到其他记录。每条读取原 Base 链接并核对本地快照，检查源 canonical thread、配置群和根消息，再用编译后的 `resolveClientThreadId` 单条验证候选数字 ID；全部通过后才开始写。
- 只向 Base 发送一个字段的更新：`Lark Message Link`。新 URL 统一为 `https://applink.larksuite.com/client/thread/open?threadid=<已验证数字ID>&chatid=7538726794547986470&thread_position=0`，保留原 hyperlink 展示文字。每次派发前重新读取当前链接，只有仍为计划旧值或已是目标值才处理；不确定响应先 read-back，不自动重发。
- 逐条确认源链接后，复用 `PlatformSyncService.syncLarkBaseTicket(cleanAfterSync=true)` 同步/清洗到本地，再只更新对应 intake 的 `client_thread_id/message_link`，以 source/thread/root/record 限定映射更新。18 条全部完成；状态和其他工作流字段未修改。没有创建/删除工单、发送消息、添加表情、触发 AI 分析或重载 Worker。
- 每条回写前后的标题、Issue 类型、状态、工单编号摘要相同；操作前后 `ticket_ai/shadow_ai/local_json` 校验摘要一致。分类仍为问答 11、feature 5、产品信息维护 1、配置 1。描述正文没有回写，本次“旧前缀为 0”仅指 `Lark Message Link` 字段，不包含正文中可能保留的旧 URL。
- 北京时间 2026-11-06 21:19 独立批量读取全部 18 条，数字链接及分类与本地一致；再次完整扫描实时 Base 的 5 页/2257 条记录，旧字段前缀剩余 0，本地也剩余 0。

| 验证类型 | 结果与证据 | 边界 |
| --- | --- | --- |
| 构建 / 静态检查 | `pnpm --dir server build`、临时脚本 `node --check`、`git diff --check` 通过 | 本轮只执行数据修复和记录更新，未新增应用代码，未重复运行既有 154 个用例 |
| Live 预检 / 写入 / 逐条读回 | actionRunId `fbd73c16-1d5b-4d1e-be74-b2ab3ef908e1`；18 验证、18 更新、18 同步、18 映射保存、失败 0 | API 核对群、canonical 和根消息；只写计划内一个 Base 字段 |
| 独立批量读回 | `/tmp/octo-link-repair/verification.json`，remoteVerified=18、localVerified=18 | 逐条链接/分类符合目标；未逐条点击客户端，模板来自前一轮已确认打开的数字链接 |
| 全表旧前缀复核 | actionRunId `93c0e9b0-4435-4d2e-88b6-a1a5cb21494c`；`/tmp/octo-link-repair/after-inventory.json` | 实时 Base 5 页/2257 条，本地与实时旧链接字段命中数均为 0 |
| 恢复 / 审计材料 | `/tmp/octo-link-repair/plan.json` 保存逐条旧/新 URL 与标识；`outcome.json` 保存逐条结果，`repair.mjs`、`verify.mjs`、`check-prefix.mjs` 保留执行逻辑 | 无正文/凭据；若需回滚，只恢复对应记录的该链接字段并重新同步，不恢复已变化的其他字段 |

### v12 历史飞书域名链接盘点

- 统计范围：配置的 Ticket Base/Table，链接字段 `Lark Message Link` 严格以 `https://applink.feishu.cn/client/thread/open?` 开头；分类取源字段 `Issue 类型`。粒度为 Base/Table/record，一条 Ticket 计一次，不根据消息或链接中的参数重复计数。
- 只读读取 `lark_base_ticket_syncs` 的标识、链接、分类、stale 与同步时间；18 条均非 stale。实时 Base 仅请求链接与类型两列，完整读取 5 页、2257 条记录，无重复 record，命中 18 条。两端 record 集合相同、分组总和均为 18，无未分类项；全部 18 条都使用 Open ID 参数。
- 类型明细：问答 11；feature 5；产品信息维护 1；配置 1。
- 查询时间：北京时间 2026-11-06 21:11:41–21:11:54，actionRunId `34f33671-25c0-4443-bf7b-0eb847ff1751`。工作脚本及仅含汇总的结果保存在 `/tmp/octo-link-inventory/query.mjs`、`/tmp/octo-link-inventory/result.json`。本地查询使用显式只读事务；未调用任何平台写接口。
- 本地筛选等价于 `SELECT issue_type, count(*) FROM lark_base_ticket_syncs WHERE lark_message_link LIKE 'https://applink.feishu.cn/client/thread/open?%' GROUP BY issue_type`；实时数据由既有链接清洗函数读取 hyperlink 的真实 URL 后匹配前缀。未输出消息正文、凭据或用户资料。
- 结论边界：v11 只修本地新建逻辑并为指定一条 intake 保存数字映射，未更新 Base 的历史 `Lark Message Link`。这 18 条仍待单独授权执行回写；本次盘点不修改链接或元数据。仅文档记录更新，`git diff --check` 验证，无应用行为变更，不重跑测试套件。

### v11 实现与验证

- `resolveClientThreadId` 中的 XOR 只生成候选；其来源为 2081 个本地唯一映射的统计，未找到官方算法承诺。每个新候选必须由话题单条读取验证 canonical `thread_id`、`chat_id` 以及 `root_id` 或根消息自身的 `message_id`；空列表、其他群/话题/根消息、非法标识均拒绝。此能力不依赖用户令牌或任何客户端凭据。
- `lark_thread_ticket_intakes.client_thread_id` 为可空文本列；新增行和旧行均兼容，schema 初始化幂等补列。保存映射时保留原阶段、失败次数和 actionRunId，拒绝创建后重建 service 仍复用该值。来源 `clientChatId` 由 Zod 校验为正整数文本，与 `oc_…` 分开，不发生 JavaScript Number 精度丢失。
- 默认配置中只补当前来源的 `clientChatId=7538726794547986470`；未改变开关或调度周期。此 local JSON 被 Git 忽略，部署其他配置需同步同一字段。
- 持久化脚本首次漏传 `readPlatformSyncConfig` 的必需路径参数，在读配置阶段失败、尚无数据库写入；补全参数后成功。此为一次性脚本错误，不加入通用错误库。

| 类型 | 命令 / 证据 | 结果与边界 |
| --- | --- | --- |
| 故障回归 | adapter 候选验证及 intake 完整数字链接断言 | 旧实现 8 个聚焦用例失败，修复后通过；另覆盖无映射时不建单、重建 service 复用、numeric 容器没有回复时读取根消息 |
| 单测 / Mock integration | `pnpm --dir server test src/adapters/lark/lark-client.test.ts src/adapters/postgres/lark-thread-ticket-intake-store.test.ts src/adapters/postgres/lark-ticket-thread-sync-store.test.ts src/application/services/lark-thread-ticket-intake.service.test.ts src/application/services/lark-thread-ticket-intake.factory.test.ts src/application/services/lark-ticket-thread-context.service.test.ts src/application/services/lark-ticket-done-reaction.service.test.ts src/application/services/platform-sync-worker.test.ts src/modules/platform-sync/lark-thread-ticket-intake.controller.test.ts src/scripts/create-lark-thread-ticket.test.ts --reporter=dot` | 10 文件 / 154 用例通过；平台为 mock、数据库为 pg-mem，不等于真实新建完整流程 |
| 静态检查 | `pnpm --dir server build`、`git diff --check` | 通过；未修改 FE/extension，无新增依赖 |
| Live 只读 API | actionRunId `c9a72244-709a-4fb2-824b-d601e8057d3e`；保存前另用实际编译 adapter 再验证 | 数字 `7704994279696895756` 返回目标 canonical ID、配置群，首条 message_id 就是登记的根消息；没有向平台写入 |
| 客户端打开 | 用户在本聊天确认数字链接可正确打开原话题 | 已验证该条数字 thread/open，thread_position=0；不推广成所有客户端/所有租户保证 |
| 指定映射写库 | actionRunId `322280bd-a07c-4293-b4fb-4e02789ae7c4` | 仅 `ALTER … ADD COLUMN IF NOT EXISTS client_thread_id text`，然后按 source/thread/root/actionRunId/record/stage 全部匹配更新 `reczz28WLje5woXO` 的映射及 message_link；提交后另行读回一致，仍 done、同一 record。没有执行整库迁移或 reset |
| 未执行 | 新建工单 live E2E、部署/Worker 重载、历史 Base 链接回写 | 尚未验证常驻 Worker 使用新逻辑；更新构建和配置后须重载生效。原失败 Base 记录的 Lark Message Link 仍需另行定向修复 |

### 2026-11-04 运行时 pending 只读排查

用户询问 Ticket Intake 为何停留在 `pending`。北京时间 14:52–14:54 读取当前本地配置、应用日志及配置数据库（显式 `BEGIN READ ONLY`），未执行平台写入、状态修复或进程操作：

- 当前配置的 scheduler 与 intake 均已开启，间隔 10 分钟，每轮每来源上限 5 条；这反映排查时的配置，不改变上文各实施阶段“未部署/未启用”的历史验证边界。
- 数据库仅有一条登记，actionRunId `a54a30bc-93e9-4830-9a29-4929ff110324`，14:43:32 入队后仍为 `pending`，`record_id=null`、`attempts=0`、`error_code=null`，尚未进入创建派发阶段。
- 同一追踪 ID 的日志包含 1 次字段读取、1 次源消息读取、5 次 Base 记录分页及 201 次话题消息读取，最后一条在 14:48:43；没有创建请求。对应 `processOne` 的旧数字 thread ID 别名逐条解析分支，创建前去重耗时超过 5 分钟。
- 14:48:45 出现新 PID 的 intake 启动日志，随后扫描报 `SYNC_ALREADY_RUNNING`。数据库旧轮次仍为 `running`，租约到 15:03:30 才到期，说明重启后旧租约继续阻止新轮次接管；按当前 10 分钟轮询配置，不能保证到期瞬间立即续跑。

本轮仅解释现状，未修改业务代码、运行配置、租约或登记行；未运行应用测试，未验证后续自动恢复。日志证据为 `server/logs/app.2026-11-04.1.log` 的上述追踪 ID；数据库仅提取阶段、错误码、计数、审计时间与租约时间，未读取业务正文或输出凭据。

### 2026-11-04 数字 threadid 与 Open API thread_id 实施前调研

本节记录 v7 实施前按 research skill 查阅官方开放平台文档、官方 Node SDK 与 CLI 源码，并读取本地缓存和两类真实 Lark 响应的结果。当时只解释去重方案；未修改业务代码、配置、登记状态或租约，未创建/更新 Base、回帖或加表情。后续实现与验证见下一节。

**结论：目前未找到公开的数字 `threadid` ↔ `omt_...` 纯转换 API 或官方转换算法。已有缓存已保存两种标识的对应关系，可先用它比较；不能把缓存未命中视为没有工单。** 不假设这些 ID 可通过进制、截取或 hash 算法互转。

官方证据与未找到的能力：

| 问题 | 官方证实 / 检索结果 | 来源 |
| --- | --- | --- |
| Open API 话题 ID 是什么 | 文档说明 `thread_id` 在当前租户内唯一，格式以 `omt_` 开头；可从消息事件、消息详情或历史消息响应获取。没有给出与客户端数字 ID 的转换规则。 | [话题概述](https://open.larkoffice.com/document/im-v1/message/thread-introduction) |
| 能否用话题 ID 只读取一条消息来归一化 | `GET /open-apis/im/v1/messages` 支持 `container_id_type=thread`、`container_id=<thread_id>`；`page_size` 范围 1–50，响应消息带 `thread_id`。`thread` 不支持起止时间过滤。公开文档引用上述 `omt_` ID 说明，**没有明确承诺数字 ID 也受支持**；数字入参可用是下方本租户实测结果。 | [获取会话历史消息](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/list) |
| 当前根 `om_...` 能否直接返回数字 ID 或消息链接 | 官方 Node SDK 的 `im.message.get` 调用 `GET /im/v1/messages/:message_id`，响应模型含 `thread_id`，并声明可选 `message_app_link`、`message_position`、`thread_message_position`；可选字段不保证返回，也不保证链接包含数字 `threadid`。当前根消息的真实响应没有 `message_app_link`，见下方。 | [官方 Node SDK get 定义（固定 commit）](https://github.com/larksuite/node-sdk/blob/b188be60134d409b61259546bcf69c731d2b0b7c/code-gen/projects/im.ts#L1005-L1070) |
| 是否有读取话题详情、同时取 `thread.id` 和 `open_thread_id` 的公开方法 | 在所查官方 `im-v1` API 目录及 Node SDK 的 `im.thread` 中，只找到 `forward`，未找到 `thread.get`、`id/open_thread_id` 双字段读取或纯 ID 转换方法。这是本次检索边界，不能据此断言平台绝对不存在其他能力。 | [消息 API 目录](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1)、[官方 Node SDK thread 资源（固定 commit）](https://github.com/larksuite/node-sdk/blob/b188be60134d409b61259546bcf69c731d2b0b7c/code-gen/projects/im.ts#L5373-L5467) |
| 官方 CLI 如何产生消息链接 | CLI 优先保留响应 `message_app_link`；没有时使用 `thread_id`、`chat_id` 和话题位置组装 AppLink，写入 `openthreadid` / `open_thread_id` 等参数。该实现直接使用 Open ID，不进行数字转换，所以 CLI 输出链接不能证明已经取得数字 ID。其 `+threads-messages-list` 命令还会拒绝纯数字输入；应区分 CLI 校验与服务端 API 的实际能力。 | [官方 CLI 链接组装（固定 commit）](https://github.com/larksuite/cli/blob/d5209485e57a0c2205ab88959811bfefe905ce29/shortcuts/im/convert_lib/content_convert.go#L246-L318)、[CLI 输入校验](https://github.com/larksuite/cli/blob/d5209485e57a0c2205ab88959811bfefe905ce29/shortcuts/im/im_threads_messages_list.go#L82-L95) |

本地缓存及真实只读证据（由本轮主排查提取，仅保存标识、计数与字段是否存在）：

- 当前 Base/Table 的 `lark_ticket_thread_syncs` 有 **2081 行**，每行 `thread_id` 均为数字，同时每行 `messages_json.messages[*].threadId` 已包含一个不同的 `omt_...` canonical ID；本次未见单行包含多个不同 canonical ID 的歧义。例如 `7704136071327518471` → `omt_198f1e396ecf185b`（record `reczz28VR17xSBb8`），`7703868420768403210` → `omt_198c2b4a2e4f1856`。这些是已经读取过的话题留下的映射，不需要重新向 Lark 逐条请求。
- 本地工单快照有 **2165 条**，2110 条有链接，其中 2109 条包含数字 `threadid`；按现有 canonical 映射比较后，有 **26 条数字链接未命中**。这是本地快照覆盖情况，不能代表实时 Base；未命中可能是缓存缺失，不能直接判定不存在同源工单。当前 `omt_198f5b76310f9851` 没有命中缓存映射，仍保留“去重尚未完整确定”的边界。
- Application Bot 调用既有 `getThreadMessages('7704136071327518471', { pageSize: 1, sortType: 'ByCreateTimeAsc' })`，返回 1 条消息，`thread_id=omt_198f1e396ecf185b`，群 ID 与 intake 来源一致，且对应关系与缓存相同；actionRunId `5758b309-ffbf-497d-beee-75a724bee3bf`。这证明**本次该数字话题 ID 可作为 thread 容器输入并读回 canonical ID**；不需要读取完整话题分页，但仍是一条真实消息读取。
- 同一追踪下，读取当前根消息 `om_x100b6199753cfca8ffdebc4ce1c7cc4` 得到 `thread_id=omt_198f5b76310f9851`，群 ID 匹配。随后以原始 `GET /im/v1/messages/:message_id` 补查可选字段，存在 `message_position`、`thread_message_position`、`thread_id`，**没有 `message_app_link`**；actionRunId `e33c6768-84f7-40b2-98ee-cb361b882336`。因此本次不能通过根消息返回的 URL 直接取得数字 `threadid`。

据此推导的改进方向（尚未实施）：优先按相同 Base/Table/source 使用现有缓存构造 `numeric → canonical` 映射，再与新根消息的 `omt_...` 比较；只对当前 Base 中尚无映射的数字链接按需读取 `page_size=1` 并持久化映射，避免每条新 intake 都重读全部历史话题。空消息、删除、不可见、权限失败或缓存遗漏应保留为“未解析”，不能当作没有重复。历史链接可继续保留，新数据的去重应记录 canonical ID 以便后续直接比较；这属于方案建议，本轮没有新增字段或改变运行逻辑。

待验证：当前 26 条未解析链接的实时 Base 存在性及可读性；空/已删除/不可见话题的单条读取边界；若后续要依赖 `message_app_link`，需验证实际返回条件及链接参数格式。静态验证仅检查本节引用的官方源码路径/行号和文档 diff；本轮不运行应用测试，以上 Live 读取不等于部署验证或性能改进已生效。

### v7 实现与验证

- 在现有 thread cache store 增加按 Base/Table 和当前 Base 数字链接集合读取唯一别名映射的方法；不接受单行或多记录冲突，不写回原始/清洗话题快照。factory 显式注入该查询，同一批次只加载一次。
- `processOne` 先比较全部本地已知映射；存在已知匹配时不访问其他缺失项。全部本地比较仍无匹配时才逐条读取缺失映射，要求返回 canonical ID 的消息属于配置来源群；新读映射继续使用原有进程缓存，不新增持久化字段或表。
- 原始创建、标题、确认、表情及未知写入边界保持原样；缓存或远端读取失败时不创建。没有为了让测试通过而跳过未解析旧链接。

| 验证类型 | 命令 / 证据 | 结果与边界 |
| --- | --- | --- |
| 故障回归 | `pnpm --dir server test src/application/services/lark-thread-ticket-intake.service.test.ts -t 'cached alias match\|aliases are already cached\|reads only the missing alias'` | 实现前 3 个用例失败，实现后通过；覆盖已缓存仍读历史、已知重复被未解析项阻断、远端返回其他群被误信 |
| 单测与模拟集成 | `pnpm --dir server test src/application/services/lark-thread-ticket-intake.service.test.ts src/application/services/lark-thread-ticket-intake.factory.test.ts src/adapters/postgres/lark-ticket-thread-sync-store.test.ts src/adapters/postgres/lark-thread-ticket-intake-store.test.ts src/application/services/lark-ticket-thread-context.service.test.ts src/modules/platform-sync/lark-thread-ticket-intake.controller.test.ts src/scripts/create-lark-thread-ticket.test.ts` | 最新 7 文件 / 76 用例通过；service 与 stores 使用 pg-mem，Lark 为 mock；factory 验证实际缓存查询依赖的注入，补充批次共享、完成后无重复查重及非法空 ID 后缀回归 |
| 静态检查 | `pnpm --dir server build`、`git diff --check`、相对文档链接检查 | 构建及 diff 检查通过；修改段落无新增断链。全篇检查发现两条 HEAD 已有的其他任务断链，保留原样；未改 FE/extension |
| Live 只读去重预检 | actionRunId `f11ea7d3-7e92-4608-ad0d-b12a33633fbd` | 当前 Base 去重后有 1971 个链接 ID，1970 为数字；新 store 可复用其中 1927 个映射，真实查询耗时约 75ms；43 个缺失映射均以单条读取解析成功，无一匹配指定当前 thread。该范围为此次真实 Base，和前一节本地快照的 26 个缺失项不同，不混为同一覆盖率；未写平台或登记行 |
| 首次指定 pending 续跑 | 原 actionRunId `a54a30bc-93e9-4830-9a29-4929ff110324`，按 source/thread/root ID 三者核对后调用既有 `processMessage` | 首次新代码尚未取得执行权即收到 `SYNC_ALREADY_RUNNING`；未删除/抢占锁。续跑前该 pending 已有旧 Worker 累计 2 次失败，旧日志错误为 `LARK_PLATFORM_REJECTED`，不能继续沿用早先 attempts=0 的历史快照解释当前状态 |
| Live 指定单条恢复 | 16:08 确认原租约已释放后再次按原登记调用既有 `processMessage` | 16:10:45 返回 done、record `reczz28VWtNVYqSc`、编号 **2465**，confirmationSent/reactionAdded 均为 true，attempts 清零、error_code 清空。未执行扫描或重置；原 actionRunId 保持不变 |
| Live 结果读回与重复提交 | 只读 actionRunId `a375e0ed-c282-4b1a-87d8-8749642ac735`；随后同一根消息再次提交 | Base 标题与登记标题一致、Octo 标题一致、Base/Octo 编号一致、shadow=ok；回帖群/话题/标题/编号正确且 sender 为当前 app，应用自己的 JIAYI 存在；重复执行仍为同 record/同 actionRunId/done。只输出布尔核对结果和非敏感结果 ID，不记录业务正文 |
| 常驻运行时 | 本轮单条验证时未重启；后续 Done 修复已重载同一 Worker | 后续于 2026-11-04 18:24 北京时间由 PM2 优雅重启当前生产 Worker；该进程同时加载缓存查重实现。重载及运行证据见 [Done 任务 v7](./2026-11-04-lark-finished-ticket-reaction.md#v7-修复和真实验证)，不据此宣称新增一次 intake 的真实创建验收 |

本轮对可复用失误作了复核：主要遗漏是持久化缓存已含 canonical ID，而新建查重只用了空的进程别名缓存。已由已有缓存不重读历史、缓存歧义不误判及 factory 注入回归覆盖，不为同一失误另造通用学习条目。

## v6 及更早验证

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


### 2026-11-06 官方话题跳转链接 API 调研

本节仅调查公开官方文档、官方 Node SDK 与 CLI 源码，不修改业务代码，不调用真实平台 API，不生成或保存消息链接 token。两个用户样例属于不同话题，不能互相借用数字 ID。主排查本轮已读到目标根消息 `thread_id=omt_19882bb05bcf1850`、`message_position=25340`、`thread_message_position=-1`，没有 `message_app_link` 或客户端数字 ID；这里只引用这一安全字段摘要，不重新读取。

**结论：未找到“输入现有话题 Open ID，API 保证返回可打开的规范链接/数字 ID/token 消息链接”的公开接口。官方 CLI 确实提供无数字 ID 的组装方式，但用户已确认本话题按其 Lark 域名、四个 Open ID 参数及真实位置 `-1` 组装后仍无法正确打开；该路径不能作为已验证修复。**

| 核查项 | 官方证据与适用边界 |
| --- | --- |
| 从现有消息读取链接 | `GET /open-apis/im/v1/messages/:message_id` 是消息读取 API。公开文档查询参数只有 `user_id_type`、`card_msg_content_type`；Node SDK 另外声明 `with_sender_name`，响应含可选 `message_app_link?: string`、`message_position?: string`、`thread_message_position?: string`。本次没有发现 `with_link`、`with_app_link` 等打开链接返回的参数，也没有文档承诺该可选字段必返。公开响应文档当前甚至没有列出该链接字段，不能把 SDK 类型当成返回保证。[官方消息读取文档](https://open.feishu.cn/document/server-docs/im-v1/message/get)、[官方 SDK 固定版本](https://github.com/larksuite/node-sdk/blob/b188be60134d409b61259546bcf69c731d2b0b7c/code-gen/projects/im.ts#L1005-L1070) |
| CLI 输出是否就是 API 原值 | CLI 优先保留 API 非空 `message_app_link`；缺失时自行补同名字段。组装优先使用 `thread_id + chat_id + thread_message_position`；缺少话题定位信息时才尝试 `chat_id + message_position`。因此看到 CLI 的 `message_app_link`，不能据此声称 API 返回了 URL。[官方 CLI 固定版本](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/shortcuts/im/convert_lib/content_convert.go#L246-L318) |
| 无数字 ID 的话题链接格式 | 官方 CLI 用 `/client/thread/open`，同时写入 `openthreadid`、`open_thread_id`、`openchatid`、`open_chat_id`，注释说明兼容 PC/移动端；`thread_position` 来自真实消息的 `thread_message_position`，没有固定成 `1` 或把 Open ID 填入数字 `threadid/chatid`。源码测试也明确保留 `-1`。这证明官方客户端工具采用该组合；**本轮用户客户端验证该组合仍无法正确打开目标话题**。[组装实现](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/shortcuts/im/convert_lib/content_convert.go#L288-L318)、[负数位置测试](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/shortcuts/im/convert_lib/content_media_misc_test.go#L377-L390) |
| Lark/飞书域名 | 官方 CLI 按品牌区分：Lark 为 `applink.larksuite.com`，飞书为 `applink.feishu.cn`。本项目当前来源是 Lark，不能由中文文档域名推导客户端域名。品牌修正与数字 ID 转换是两个问题。[官方品牌 endpoint 定义](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/internal/core/types.go#L129-L146) |
| 能否搜索获得数字 ID | `POST /open-apis/im/v1/messages/search` 返回 `meta_data.chat_id/thread_id/position/thread_position`；官方示例明确是 `oc_...` 和 `omt_...`，未提供数字 `chatid/threadid` 或转换关系。该文档鉴权列为 `user_access_token`、权限 `search:message`；CLI 却声明 user/bot 均支持，两者存在能力描述差异。本轮不做实测、不把搜索当成数字映射接口，也不将 Application Bot 流程改为个人身份。[官方搜索文档](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/search)、[CLI 身份声明](https://github.com/larksuite/cli/blob/05ac58ffa089fe7a171205ac1d1e97ee50196ec8/shortcuts/im/im_messages_search.go#L29-L35) |
| `client/message/link/open?token=...` 能否替代 | Lark 帮助说明客户端可复制普通聊天中的单条/多条消息链接，也可复制普通聊天 thread 内的消息或整串回复；同时明确 “This feature is not supported in topic groups.” 因此普通聊天的 thread 与话题模式群不能混为一谈。该帮助没有提供 token 签发 API。本次所查公开 IM API、SDK、CLI 没有找到为已有消息生成该 token 的接口，不能假设 token 可由 `om_/omt_/oc_` 计算出来。[Lark 官方帮助](https://www.larksuite.com/hc/en-US/articles/424807561494-copy-and-paste-a-message-link)、[官方消息 API 目录](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1) |

官方 CLI 的组装模板如下（参数值必须分别 URL 编码）；该模板在当前目标话题的用户客户端验证失败，保留作证据：

```text
https://applink.larksuite.com/client/thread/open?openthreadid=<omt_...>&open_thread_id=<omt_...>&openchatid=<oc_...>&open_chat_id=<oc_...>&thread_position=<API返回的thread_message_position>
```

当前目标根消息的位置为 `-1`，用户已验证保留该原值、采用 Lark 域名及全部四个 Open ID 参数后仍打不开或跳错位置。没有依据凭其他话题样例强制成 `0/1` 或替换数字 ID。主排查另外提供 `https://applink.larksuite.com/client/chat/open?openChatId=<oc_...>&position=<message_position>` 会话位置候选，目标位置取真实 API 返回的 `25340`；用户确认能够定位原话题，但随后明确最终必须使用数字 `thread/open`，因此不以该替代方案关闭任务。继续核查数字 ID 来源。

检索边界：核查官方消息读取/历史列表/搜索文档、话题说明、官方 Node SDK `b188be6` 及 CLI `05ac58f` 的链接组装和 IM 资源目录；未找到独立 `thread.get`、链接生成 API、数字 ID 转换 API 或复制消息 token 签发 API。转发/合并转发/话题转发即使返回 `message_app_link`，也是创建新消息的写操作，不是读取原话题链接，本轮不采用。官方仓库的 [#2706](https://github.com/larksuite/cli/issues/2706) 和 [#1031](https://github.com/larksuite/cli/issues/1031) 是用户请求，不能作为平台能力或不可用性的官方承诺。

验证：已检查引用的官方原文、固定 commit 源码路径/行号及文档 diff。未运行应用测试；本子调研未执行 live API 或客户端操作；上述客户端失败由本轮用户反馈提供。没有业务代码变更、部署、重启或历史链接修复。`chat/open` 候选的验收由主排查继续记录，以上调研不替代客户端验收。
