---
title: "Lark thread Ticket AI 只读应用"
module: "ai-ticket"
status: in_progress
requirement_version: 16
created_on: 2026-09-23
updated_on: 2026-09-23
closed_on: null
owner: TBD
---

# Lark thread Ticket AI 只读应用

## 目标

在 Octo FE 增加适合 Lark 侧栏的原生网页应用页面，呈现已有 Ticket AI / Shadow AI。采用本地开发而非妙搭托管。v1–v5 保持 Server 不改；v6 用户授权先接 H5 免登，新增服务端登录入口；v7 用户进一步授权完成签名与 openChatId 采集/日志；v13 确认群 ID 无法定位当前 thread，移除 FE 会话采集、日志和展示，保留 H5 免登及手动搜索。

## 验收标准

- [x] v16 在免登失败诊断中提取内层数字错误码及固定原因提示，限定字符串长度及输出数量，不上报原文；覆盖新旧 SDK API 失败与敏感字段排除测试。

- [x] v15 增加 H5 免登阶段、SDK 数字错误码和回调来源的脱敏诊断；复用客户端日志接口并贯穿 actionRunId，日志失败不影响登录，验证敏感字段不进入日志。

- [x] v12 在 lark-app 选中 Ticket 后，于标题正下方用一组小 badge 展示状态、Issue 类型、负责人和 Business Line；复用已有组件，缺失值明确显示，窄屏自动换行。

- [x] v13 停止 FE openChatId 获取、签名请求及对应诊断上报，移除会话诊断 UI 和专用采集代码；保留 H5 免登、标题/编号搜索与 Ticket 信息 badge。v7/v9 采集验收已 superseded。

- [x] 独立紧凑页面，已有 Web Session 和平台数据权限保护，支持 Ticket 深链接与无上下文时选择 Ticket。
- [x] 必须登录 Octo 后使用；Lark 客户端无会话时走 H5 SDK 免登，失败及普通浏览器保留原登录。Server 校验授权码，按租户 + openId 关联用户，保留角色和已有 API 凭证。
- [x] 当前用户接口返回 Octo user.id、Lark user.larkOpenId 和 user.larkTenantKey；客户端不可传入 ID 冒充用户。
- [x] 展示意图、问题总结、答案、Shadow 详情、时间及来源；失败/跳过/缺失状态明确。
- [x] 回复参考只复用已有答案，允许本地编辑和复制；不调用模型、不发送消息、不写回。
- [x] 页面顶部常驻紧凑标题搜索框；选择候选后展示对应分析，详情内可直接继续搜索切换；无结果时明确提示。
- [x] 规划真实意图、危险等级 1–9、对方要什么、是否马上回复、最佳动作，标明未实现。
- [x] FE 测试、构建、页面验证；记录平台入口配置和真实 Lark E2E 的完成边界。
- [ ] 真实 Lark H5 免登验收：需部署 FE/Server 并完成平台配置后验证，mock 通过不代表已部署。
- [ ] 在真实 Lark 开发者后台完成输入框菜单入口配置及版本发布，部署并验证入口。当前后台需登录，部署目标尚未确认可用。

## 方案与决策

- 复用 `GET /api/web/platform-data/lark-tickets`，其响应已有 `ticketAi` 与 `shadowAi`。现有 q 仅检索标题/编号，不假装存在 recordId/threadId 查询接口。完整列表分页由既有 service 处理，随后精确匹配三元组。
- 使用 `#lark-app-thread-analysis?baseId=...&tableId=...&recordId=...` 页面。v2 根据用户指定的 Message Shortcuts 文档，采用原生网页应用 `https://applink.larksuite.com/client/web_app/open?appId=...&mode=sidebar&lk_target_url=...`；原先通用 web_url 入口方案 superseded。含 hash 的 URL 不使用 path 参数。
- 正式字段逐项优先，成功 Shadow 兜底；两种来源可分别查看，不把 Shadow 或正式写回等同于人工审核通过。
- 现有投影没有候选回复或沟通风险判断。回复区标注“已有答案参考”，不虚构候选概率/风险分数，不自动发送。
- v1–v5 历史范围：识别 PC/mobile 消息快捷操作参数并进入手动选 Ticket 页面，Server 不改。免登与签名限制已由 v6/v7 用户授权取代；自动 thread 映射和原生编辑器填入仍未实现。
- 用户指定复用 `server/.env` 的 Lark App ID，已仅复制公开 ID 到忽略提交的 `fe/.env.local`。未读取/输出 App Secret、未更改 server/.env。后台注册/发布仍须平台登录状态和实际部署地址。
- v3：用户确认 thread 无法放链接，采用打开应用后按标题搜索的方案；v2 的 thread 链接主入口 superseded。顶部搜索始终可用，复用已读取列表筛选，不增加 Server API。移除“放入 thread”提示与入口卡；保留 URL 三元组用于页面内切换和已有深链接兼容。输入框菜单只能依据文档取得会话上下文，不能假设存在 thread ID。
- v4：用户要求记录 openChatId 供后续研究。保持 Server 零修改，复用 `/api/debug/client-log`；增加启动诊断及已初始化 SDK 的 `getTriggerContext` 分支。当前未加载或签名 SDK，因此不宣称已打通真实 ID。日志只提取 ID 和安全状态，不记录触发码/URL/原始错误。每个文档仅尝试一次，5 秒超时，日志失败不阻断页面。
- v5：用户明确必须通过 Lark 当前用户关联 Octo 或 Octo 自行登录。本版采用已有 Octo OAuth 登录；核对 App 会话门禁、路由权限、服务端 401/403 保护，增加应用专属登录提示。模拟预览已登录不代表绕过真实鉴权。未扩展到 H5 免登或签名服务。
- v6：用户授权先实现免登，openChatId 后续处理。加载官方免登示例 SDK，requestAccess(scopeList=[])，仅不支持时回退 requestAuthCode；失败保留手动登录。Server 新增 h5/start 与 h5/complete，严格 Origin + HttpOnly proof + 三分钟挑战，复用 oauth_sessions 存储并原子消费，验证 Lark code 后关联用户并签发现有 Web Session。最小登录 token 不保存、不覆盖已有广泛授权；新用户无默认权限。profile 返回经验证的用户 ID。无数据库迁移。删除此前 openChatId 条件调用，未实现签名。

- v7：用户明确要求把获取 openChatId 也处理完。增加 H5 签名接口，校验登录会话和同源 URL；Server 内缓存 tenant token/jsapi ticket，每次请求产生新 nonce 和毫秒 timestamp。FE 保留 query 原始编码，等待 config 成功与 ready 后读取输入框菜单上下文，上报安全日志并显示结果。单条消息菜单 message_action 明确不支持，未伪造会话/消息/线程映射。无数据库迁移。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-23 | v1 | in_progress | 确认用户选择原生应用、本地页面、Server 零改动；核实已有投影及官方 AppLink 协议。 | 实现及验证 FE；核对平台配置条件。 |
| 2026-09-23 | v2 | in_progress | 用户指定消息快捷操作文档及复用现有 App ID；修正为 web_app + sidebar。完成路由、页面、三元组匹配、来源展示、草稿复制、规划区、入口生成、OAuth 返回和接入说明。 | 原生后台当前为登录页；server/.env 回调为 ngrok 开发域名，本机 FE/server 未运行。未发布或验证真实消息快捷操作。 |

| 2026-09-23 | v3 | in_progress | 顶部常驻小搜索框，按标题/编号匹配，候选最多 20 条；点选切换并清空搜索，Escape/失焦收起。移除 thread 链接卡及生成逻辑，更新输入框菜单说明。 | FE 本地验证通过，真实 Lark 入口和部署仍待完成。 |
| 2026-09-23 | v4 | in_progress | 增加 LARK_APP_OPEN_CHAT_CONTEXT 日志及 SDK 条件采集；定向 5 测试覆盖成功脱敏、参数缺失/格式错误、SDK 失败/超时、日志接口失败。 | 未新增签名接口；真实 openChatId 尚未取得，未部署。 |
| 2026-09-23 | v5 | in_progress | 核对既有登录门禁与服务端权限控制，补充 Ticket AI 专属登录提示及登录要求说明。 | H5 免登未实现，真实 Lark WebView OAuth 尚未验收。 |
| 2026-09-23 | v6 | in_progress | 实现 H5 免登、浏览器绑定的一次性挑战、身份字段返回和失败回退；保留现有凭证和角色。新增服务端/前端模拟测试。 | 未部署；真实 Lark 客户端 SDK/CDN/授权/Cookie 流程尚未验收。 |

| 2026-09-23 | v7 | in_progress | 接入签名、票据缓存、SDK 鉴权和输入框菜单会话采集、安全日志及诊断 UI；本地测试和构建通过，浏览器验证普通环境失败不阻断搜索。 | 未部署、未配置可信域名，真实 Lark API/SDK 和日志落盘仍待验证。 |

| 2026-09-23 | v8 | in_progress | 按用户要求将页面 hash 入口改为 `#lark-app-thread-analysis`，同步深链接、启动入口、OAuth 返回解析及配置文档。 | 真实客户端验收边界保持不变。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 源码/合同核对 | 已完成 | platform-sync-store.ts、lark-ticket-ai.ts、platform-data-api.js | 不代表线上数据已读取。 |
| FE 单测 | 通过 | FE 下 `node --test`：239/239，含 5 个新用例 | 包含深链接、权限、来源、错误 Shadow 不兜底、官方场景标记、OAuth 返回、AppLink 参数。不调用真实服务。 |
| FE 构建 | 通过 | FE 下 `node node_modules/vite/bin/vite.js build` | 与 package script 相同构建命令；不代表部署。 |
| pnpm 包装命令 | 未通过环境检查 | `pnpm --dir fe check` 触发自动 install，失败于 registry 网络与无 TTY 模块清理确认 | 未删除 node_modules；改用已有依赖直接执行 node:test/Vite。 |
| 浏览器 mock integration | 通过已检查项 | 临时 127.0.0.1:4193 合成数据页面；360px 侧栏截图、来源、Shadow 展开、草稿编辑/复制成功提示、消息场景手动选择、失败态 | 无真实数据；复制按钮成功提示不代表 Lark 粘贴/发送已验证。 |
| Lark 平台/部署 | 未完成 | 现有应用后台跳转登录页 | 未配置或发布真实入口，未执行 H5 SDK 签名/所选消息获取。 |
| v3 FE 验证 | 通过 | `node --test` 238/238；Vite 构建；浏览器验证标题搜索、选中切换、详情继续搜索及无结果提示 | 合成数据，不代表线上数据或原生客户端验收。 |
| v4 FE 验证 | 通过 | `node --test` 243/243；Vite 构建 | SDK 与日志接口均为单元 mock；未验证真实签名、ID 获取和 Server 文件落盘。 |
| v5 FE 验证 | 通过 | `node --test` 243/243；Vite 构建；静态核对 App.jsx 和 platform-data.controller.ts 的登录/权限保护 | 未重跑 Server 测试；未执行真实 OAuth 或 WebView 验收。 |
| v6 Server 验证 | 通过 | 9 个文件 50 项定向测试：lark-auth、API 鉴权/日志、OAuth store、路由；`tsc` 构建通过 | 真实 Lark API 以 mock 替代，持久化测试使用 pg-mem；未运行 Server 全量测试或部署。初次新增凭证保留测试因 fixture 缺少 larkUserId 失败，补齐后通过。 |
| v6 FE 验证 | 通过 | `node --test` 244/244；Vite 构建通过；确认源码不再调用 getTriggerContext/h5sdk.config 或上报会话日志 | 授权码/SDK 为 mock；未验证真实 CDN 加载、客户端授权和 WebView Cookie。 |

| v7 Server 验证 | 通过 | 10 个文件 55 项定向测试：票据缓存/并发/失败重试、签名原串/毫秒时间/同源与会话保护、lark-auth、鉴权/日志及路由；`tsc` 构建通过 | 外部 API 使用 mock；未运行 Server 全量测试，未部署。 |
| v7 FE 验证 | 通过 | `node --test` 250/250；Vite 构建通过；模拟 config 与 ready 顺序、失败/超时/迟到回调、日志脱敏；浏览器合成页面确认 NOT_LARK_CLIENT 和日志上报失败提示，标题搜索及详情可用 | 预览没有真实日志接口；未验证真实 Lark config、openChatId 或 Server 文件落盘。 |

v7 签名样例核对：官方教程给定完整签名原串的示例 SHA-1 与计算结果不一致，首次按其列出摘要断言失败。使用 Node crypto 与 Python hashlib 对同一原串独立计算，均得 `40a68999ecf7e05907edba43b31a50fd1830c777`；测试改为验证原串算法结果，未将文档示例摘要硬编码进实现。

| v8 FE 验证 | 通过 | 更新现有路由/深链接测试，`node --test` 250/250；Vite 构建及 `git diff --check` 通过；源码和接入说明未残留旧 hash 入口 | 未部署或重跑真实 Lark 验收。 |

## 2026-09-23 真实客户端日志排查

- 本次范围：核实是否取得 openChatId，解释失败阶段及后续用途；未修改运行代码或平台配置。
- `server/logs/popup-client.2026-09-23.1.log:34–35` 的 15:13:25、15:14:28 两次诊断均为 `scene=plus_menu_group`、`stage=context`、`status=unavailable`、`openChatId=null`、`errorCode=H5_CONFIG_FAILED`。按 actionRunId 关联服务端日志，均有 `LARK_H5_SIGNATURE_OK`，对应 signature API 返回 200。
- 运行时证据表明输入框菜单入口已识别，服务端已生成签名，但不证明客户端接受签名。源码的 config.onFail 与 h5sdk.error 均丢弃 SDK 错误详情，现有日志不足以区分可信域名、应用配置或签名校验等原因；未取得成功会话 ID，真实验收仍未完成。
- openChatId 可作为会话范围；若后续建立会话与 Ticket 的关联，可用于缩小候选。当前 Ticket 上下文服务从 larkMessageLink 解析 threadId，群聊 ID 无法唯一确定当前话题或 Ticket。下一步建议先补充白名单化 SDK 错误码和失败回调来源，再复现鉴权失败；本次未实施。
- 验证边界：只读日志、源码与官方 SDK 示例核对；未运行测试、重新部署或调用聊天读写 API。

## 2026-09-23 页面宽度调整

- 用户反馈 Lark 客户端内页面受 560px 最大宽度限制。本次仅将 `.lark-app` 改为 `width: 100%`，使用容器可用宽度，保留现有窄屏间距规则。
- 验收：样式不再限制最大宽度为 560px，FE 构建通过；真实 Lark 客户端效果待部署后确认。
- 后续反馈：用户明确是整个 Lark 原生侧栏无法拖宽，前述 CSS 修改未解决这一问题。代码核对未发现页面祖先容器另有限宽；接入说明采用 `mode=sidebar`，未配置容器宽度参数。
- 核对官方文档：飞书 H5 AppLink 文档列出 `min_width` / `max_width`（sidebar 专用、7.9 起支持、默认均为 350）；Lark 国际版文档未列出。已在接入说明补充 `min_width=560&max_width=1000` 的具体待验证入口方案。未修改真实平台菜单配置、未确认国际版客户端支持，问题保持待验证；未继续改动 CSS 或重跑应用测试。

- 最新宽度要求：按用户指定，将 `.lark-app` 设置为 `width: 100%; max-width: 768px`，替代此前无最大宽度限制的方案。仅调整网页样式；静态 diff 检查通过，未部署或进行客户端验证。

## v9 openChatId 诊断增强

- 复用现有 `LARK_APP_OPEN_CHAT_CONTEXT` 和 actionRunId；FE 新增版本化诊断、SDK 数字错误码、固定关键词提示、SDK 能力、签名 HTTP 状态/白名单错误码、事件顺序/耗时、终止状态与回调来源。页面失败态显示阶段、来源及诊断编号。未改变 SDK 鉴权规则或自动匹配 Ticket 行为。
- 原始 SDK 错误、凭证、完整 URL/UA 均不落日志；关键词提示不是根因结论。终止后忽略迟到回调，保持已上报诊断稳定。
- 验证：FE 全量 `node --test` 46 个测试文件通过；定向用 `node src/services/auth/lark-h5-context.test.js` 验证 12 个用例通过，覆盖成功、config/global error、签名拒绝、缺少 ready、超时、迟到回调、方法缺失、非法 ID 与日志脱敏；Vite 构建通过。无 Server 修改，未跑 Server 测试；未部署或验证真实客户端。新增最后两个测试时首次使用了错误的相对路径，写入失败后更正并重跑定向用例。
- 下一步：部署 FE 后从 Lark 输入框菜单重新打开，根据页面诊断编号关联 popup-client 与 app 日志，确认 SDK 数字错误码及回调来源后修复实际鉴权原因。

## v11 Ticket 信息 badge

- 用户进一步明确为标题正下方的一组小 badge，替代 v10 的三张独立卡片。复用 `ticketStatus`、`responsible`、`businessLine` 以及已有徽标/人员组件，支持多人负责人和缺失值提示；Flex 按可用宽度换行。
- 验证：FE Vite 构建和定向 diff 检查通过。仅展示与样式调整，未新增或运行单元测试；未部署、未进行真实 Lark 客户端视觉验收。

## v12 Issue 类型

- 在标题下方的 badge 组中增加 Issue 类型，读取既有 `ticket.issueType`，复用 `LarkTicketBadge` 的 type 配色，空值显示“未设置”。
- 验证：FE 构建与定向 diff 检查；未部署或进行真实客户端验收。

## v9 真实日志复查：安全域名未匹配

- 2026-09-23 15:48:58，诊断编号 `8e23fede-b8a6-4231-8d63-df26e50fae6c`：`popup-client.2026-09-23.1.log:41` 记录 `errorCode=333448`、`errno=2601002`、关键词 `domain`；config 调用后 156ms 触发 h5sdk.error，ready/authenticated/contextCalled 均为 false，openChatId=null。对应 app 日志有 LARK_H5_SIGNATURE_OK，签名 HTTP 200。
- 核对 Lark 官方 h5sdk.config 文档：333448 表示“页面不在安全域名内”，与签名错误 333441 不同。当前配置 Web origin 为 `https://octotest.odoo.tenways.it:18443`；下一步应核对同一应用的 JSAPI 安全域名是否覆盖实际页面来源。未读取原始凭证、未修改平台配置，成功取得 openChatId 仍未验收。

## 2026-09-23 指定群的只读匹配验证

- 用户要求查询指定 `oc_…` 会话的话题与 Ticket 编号/标题，随后限定只需 10 个匹配。使用当前应用 tenant token 只读查询群消息；首轮读取 100 页、4,982 条消息、490 个不同 `omt_…`，仍有历史未读，不代表群全量。随后停止 API 遍历。
- 直接比较 API `thread_id` 与 Ticket 链接 `threadid` 得到 0 匹配：后者及快照顶层 thread_id 是数字标识。改为从已有快照 messages_json 中仅提取消息的 threadId，与实际群返回的 `omt_…` 精确关联，再按完整 base/table/record 三元组关联 Ticket，返回 10 个不同话题的编号和标题。未输出消息正文或凭证、未写数据库、未实施自动打开功能。
- 已匹配样本编号：1902、1904、1905、1907、1906、1900、1885、1886、1888、1878。此次证实可从群关联多个 Ticket，未识别用户当前查看的话题；依赖已有消息快照的匹配不能覆盖尚未同步快照的 Ticket。

## v13 移除会话采集与诊断

- 用户确认会话 ID 无法定位当前 thread，取消 FE 采集及展示。已删除专用 lark-h5-context 服务与测试、页面 effect 和会话诊断区；停止该页面的 signature 请求、getTriggerContext 调用及 LARK_APP_OPEN_CHAT_CONTEXT 上报。
- 保留 H5 免登、标题/编号搜索、Ticket 深链接和四类信息 badge。Server 签名接口未改动，历史日志和任务证据保留；未开发群到 Ticket 自动打开能力。
- 验证：FE 全量 `node --test` 45 个测试文件通过，Vite 构建通过，diff 检查通过；静态搜索确认 fe/src 无 getTriggerContext/openChatId/会话诊断服务/签名请求残留。未部署或执行真实 Lark 客户端验收，未运行 Server 测试（无服务端代码改动）。

## v14 版本与提交

- 按用户要求将插件 `extension/manifest.json` 和 `server/package.json` 的发布版本从 0.10.0 更新为 0.11.0，沿用此前发布版本维护范围，FE 独立包版本不变。版本声明 JSON 与 diff 检查通过；前述 FE 测试/构建已通过。
- 本次提交包括 lark-app 的会话采集移除、768px 最大宽度、Ticket 信息 badge、相关说明及版本声明；使用独立 Git index 保留其他任务的暂存修改和未合并索引。未推送、打标签、打包插件或部署。

## 2026-09-23 H5 免登失败日志排查

- 本次范围：只读排查日志与登录源码，定位失败阶段；未修改运行代码、平台配置或部署。
- `server/logs/api.2026-09-23.1.log` 显示 16:58:09、16:58:19、16:58:52 三次 `/api/lark/auth/h5/start` 均为 200，对应此前 `/api/web/profile` 均为 401。当日已检查日志没有 `/api/lark/auth/h5/complete` 请求，也没有 `LARK_H5_LOGIN_FAILED` 服务日志。
- 按 `fe/src/services/auth/lark-h5-login.js` 调用顺序，start 在 SDK 加载成功后执行，complete 在取得 code 后执行。因此本次可定位到初始化成功后、提交授权码前；尚未进入服务端兑换授权码或签发 Web Session 阶段。无法仅凭缺少 complete 排除客户端网络中断或页面提前关闭。
- 诊断缺口：SDK fail 回调丢弃原始数字错误码，`App.jsx` 的 catch 统一显示“自动登录未完成”，没有免登失败日志上报。现有证据不能区分 ready 未触发、SDK 拒绝、缺少 code、超时等原因；历史 openChatId 签名的安全域名问题不能直接作为本次免登根因。
- 下一步：复现时取得经过脱敏的客户端失败阶段、SDK 数字错误码及回调来源，再判断平台配置或 SDK 调用问题。静态源码与运行日志已核对；未运行测试或真实 Lark E2E，根因尚未确认。

## v15 H5 免登诊断

- 用户授权增加免登日志。复用 `/api/debug/client-log`，事件 `LARK_H5_LOGIN_DIAGNOSTIC`，记录 SDK load/ready/requestAccess/requestAuthCode、server start/complete、session profile 阶段及耗时、HTTP 状态、固定错误码和 SDK 数字错误码。用既有 actionRunId 关联；不上传原始错误文本、授权码、challenge、Cookie、用户资料或 URL。
- 上传异步、三秒超时且失败不阻断登录；忽略授权结束后的迟到失败回调。未改变平台授权和手动登录回退规则。
- 验证：定向 `node fe/src/services/auth/lark-h5-login.test.js` 10/10 通过，涵盖数字错误码脱敏、ready/授权超时区分、迟到回调和日志失败隔离；FE Vite 构建通过，diff 检查通过。SDK 和上传均为 mock，未跑全量测试或真实 Lark E2E；未部署，真实客户端错误原因需部署 FE 后复现，尚未确认。

## v15 真实免登失败复查

- 2026-09-23 17:04:21、17:04:25 的 `LARK_H5_LOGIN_DIAGNOSTIC` 已落入 `server/logs/popup-client.2026-09-23.1.log`，说明新增诊断已在客户端运行。actionRunId 分别为 `98b4a26e-c77f-49f5-a9a6-1f52710337c9`、`cb42a9d3-2168-4c01-9922-4bae5a28f671`。
- 两次均为 SDK load/ready 成功、server start HTTP 200；requestAccess 分别在调用后 142ms、121ms 触发 fail，均返回 `sdk_errno=2700002`、`sdk_errCode=999`，没有进入 complete。可排除本次 SDK 加载失败或 ready/授权等待超时。
- `H5_LOGIN_DENIED` 是本地统一分类，不能据此认定用户拒绝授权。当前日志没有 SDK errString 内层错误原因；公开官方页面未取得可核实的错误码解释，不能把重定向 URL、安全域名或应用权限配置直接判定为根因。需继续取得脱敏的内层错误码/固定原因分类或客户端调试证据。
- 本次仅核对日志和源码、更新任务证据，未修改运行代码或配置，未重跑测试。

## v16 免登内层错误诊断

- 用户授权继续诊断。仅从 SDK `errString`、`errMsg`、`message` 的前 4096 字符提取明确 `Error code: <number>` 标记（最多 8 个去重数字）及固定短语提示；不上传原文、URL 或凭证。诊断版本为 2，新增 `sdk_innerErrorCodes`、`sdk_reasonHints`；提示只代表文本匹配，不作为已确认根因。
- 原有授权调用及回退规则保持不变。静态 diff 检查、12 项 FE 定向单测及 Vite 构建通过；测试覆盖新旧 API 内层提取、去重、未知文本、非法数字、长度限制与敏感字段排除。SDK 和日志上传均为 mock，未运行全量测试、真实客户端 E2E 或服务端测试（无服务端修改）。未部署，需新版 FE 在真实客户端复现后确认内层错误原因。

## v16 真实日志确认：H5 重定向地址无效

- 2026-09-23 17:09:02，`popup-client.2026-09-23.1.log` 中 actionRunId `1c729866-134c-4002-8ded-52d4252782d8` 已为 diagnosticVersion=2。SDK load/ready 成功、start HTTP 200；requestAccess 调用后 120ms 失败，顶层 errno=2700002、errCode=999，内层 `sdk_innerErrorCodes=[20029]`、`sdk_reasonHints=[INVALID_REDIRECT_URI, AUTHORIZATION_TERMINATED]`。
- 此次 SDK 明确报告重定向 URI 无效并终止授权，未进入 complete；前次缺失的内层原因已取得。尚未读取平台后台，具体不匹配项仍需核对。
- 只提取本地 server/.env 的非敏感 URL 部分：当前配置 origin 为 `https://octo.odoo.tenways.it:18443`，OAuth callback path 为 `/api/lark/auth/callback`；若实际 H5 页面位于该站根路径，待核对的页面地址为 `https://octo.odoo.tenways.it:18443/`。本地配置不等于已确认客户端实际 URL 或部署进程配置，不能使用早期任务中的 octotest 地址替代核实。
- 下一步在对应 Lark 应用的重定向 URL 设置核对实际 H5 页面地址（协议、域名、端口、路径），保留原有服务端 OAuth callback；修正平台配置后复测。未改平台配置或运行代码、未重跑测试。

## v16 配置重定向后的复查

- 用户反馈已配置 `https://octo.odoo.tenways.it:18443/`。最新 17:11:29、17:11:36–37 两次诊断（actionRunId `4c872727-df28-424d-80df-281153959f6a`、`2bf062a4-e423-410a-81ce-fc435579b84d`）仍为 requestAccess.fail，errno=2700002、errCode=999、内层 20029、INVALID_REDIRECT_URI；SDK ready 和 start HTTP 200 正常，无 complete 请求。
- 已核对本地 server/.env 的公开 App ID 为 `cli_a9155c5fb1b99ed2`；start 源码返回 deps.appId。现有日志未记录实际客户端页面地址和运行时 App ID，因此尚不能区分配置在不同应用、实际页面路径不同或平台配置尚未生效。此前给出的根地址是根据本地配置推定，不能当作实际客户端 URL 的已验证证据。
- 下一步核对对应应用的重定向 URL 配置与实际 H5 页面地址。未修改运行代码、平台配置或重跑测试。

## 关联

- [页面接入与后续边界](../../../fe/docs/lark-ticket-app.md)
- [官方消息快捷操作](https://open.larksuite.com/document/client-docs/extensions/message-shortcuts)
