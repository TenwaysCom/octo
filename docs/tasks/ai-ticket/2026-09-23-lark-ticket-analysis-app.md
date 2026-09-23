---
title: "Lark thread Ticket AI 只读应用"
module: "ai-ticket"
status: in_progress
requirement_version: 8
created_on: 2026-09-23
updated_on: 2026-09-23
closed_on: null
owner: TBD
---

# Lark thread Ticket AI 只读应用

## 目标

在 Octo FE 增加适合 Lark 侧栏的原生网页应用页面，呈现已有 Ticket AI / Shadow AI。采用本地开发而非妙搭托管。v1–v5 保持 Server 不改；v6 用户授权先接 H5 免登，新增服务端登录入口；v7 用户进一步授权完成签名与 openChatId 采集/日志。

## 验收标准

- [x] 独立紧凑页面，已有 Web Session 和平台数据权限保护，支持 Ticket 深链接与无上下文时选择 Ticket。
- [x] 必须登录 Octo 后使用；Lark 客户端无会话时走 H5 SDK 免登，失败及普通浏览器保留原登录。Server 校验授权码，按租户 + openId 关联用户，保留角色和已有 API 凭证。
- [x] 当前用户接口返回 Octo user.id、Lark user.larkOpenId 和 user.larkTenantKey；客户端不可传入 ID 冒充用户。
- [x] 展示意图、问题总结、答案、Shadow 详情、时间及来源；失败/跳过/缺失状态明确。
- [x] 回复参考只复用已有答案，允许本地编辑和复制；不调用模型、不发送消息、不写回。
- [x] 页面顶部常驻紧凑标题搜索框；选择候选后展示对应分析，详情内可直接继续搜索切换；无结果时明确提示。
- [x] 规划真实意图、危险等级 1–9、对方要什么、是否马上回复、最佳动作，标明未实现。
- [x] FE 测试、构建、页面验证；记录平台入口配置和真实 Lark E2E 的完成边界。
- [x] v7 实现经 Web Session 保护的签名接口、SDK 鉴权后获取输入框菜单 openChatId、安全日志和页面诊断；失败不影响搜索，不推断 thread/Ticket 映射。
- [ ] 真实 Lark H5 签名和 openChatId 验收：需部署及可信域名配置；单条消息菜单上下文尚未接入。
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

## 关联

- [页面接入与后续边界](../../../fe/docs/lark-ticket-app.md)
- [官方消息快捷操作](https://open.larksuite.com/document/client-docs/extensions/message-shortcuts)
