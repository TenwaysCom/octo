# Ticket AI 输入框菜单应用

本地页面：`http://localhost:4173/#lark-app-thread-analysis`。部署后使用 FE 的同源地址。页面复用 Web Session 和平台列表权限，通过既有 GET 接口读取 Ticket。v6 增加 H5 SDK 免登，v7 接入签名及输入框菜单的 openChatId 采集。真实 Lark 客户端验收仍待部署后完成。

## 开发者后台配置

1. 在目标自建应用启用网页应用能力，将首页设为 `<Octo FE origin>/#lark-app-thread-analysis`。应用域名应与现有 OAuth 回调和 `/api` 同源部署相符。
2. 构建部署 FE 和 Server，确认页面与 `/api` 同源，且该 origin 与 Server 的 `LARK_OAUTH_CALLBACK_URL` 一致；H5 免登入口会严格检查 Origin。App ID 从 Server 下发，App Secret 只保留在 Server。SDK 使用官方免登示例的固定 1.5.26 版本，部署环境需允许加载对应 CDN。在 Lark 开发者后台的安全设置中，将实际 FE 域名加入 H5 SDK 可信域名。
3. 在 **Features → Extensions → Message Field Shortcuts（输入框 + 菜单）** 启用入口，名称建议“查看 Ticket AI”。桌面入口填写：

   ```text
   https://applink.larksuite.com/client/web_app/open?appId=<cli_app_id>&mode=sidebar&lk_target_url=<encodeURIComponent(完整页面URL)>
   ```

   完整页面 URL 是 `<Octo FE origin>/#lark-app-thread-analysis`。包含 `#` 的地址使用 `lk_target_url`，不能放在 `path`。协议及域名需与应用首页一致。进入后，在顶部搜索框输入 Ticket 标题关键词，点击候选查看分析；详情中也可继续搜索切换。
4. 完成应用版本发布，在已批准的可用范围内验证消息菜单入口。本文仅提供配置，不代表后台已创建/发布应用。

若应用首页已经直接配置为 `/#lark-app-thread-analysis`，输入框菜单可省略 `lk_target_url`，使用 `web_app/open?appId=<cli_app_id>&mode=sidebar`。若保留现有工作台首页，则仍使用上述 `lk_target_url` 指定分析页。不要把本地合成数据验证端口作为线上应用地址。

## 本轮能力及边界

| 项目 | 行为 |
| --- | --- |
| 菜单场景 | 识别 `message_action`、`chat_action`、`plus_menu_p2p`、`plus_menu_group` 启动场景；无 hash 时进入应用页。建议入口 URL 显式指定 `#lark-app-thread-analysis`。 |
| 标题搜索 | 顶部常驻小搜索框，按标题或编号进行不区分大小写的包含匹配，显示最多 20 个候选及总数；无结果有提示。点选后显示分析，Escape 或失焦收起候选。 |
| 会话诊断 | 输入框菜单启动时，登录后通过 Server 签名和 SDK 获取 openChatId，上报安全诊断日志；页面可展开查看结果。普通浏览器或缺少参数时显示原因，不阻断搜索。 |
| 当前 thread → Ticket | **未接入**；本版采用手动搜索选择，无需 thread 添加链接。保留已有深链接的三元组定位能力。 |
| 数据读取 | 复用 `GET /api/web/platform-data/lark-tickets` 及既有分页实现，精确匹配 baseId/tableId/recordId。当前接口不能按消息 ID 查询；没有新增接口。 |
| 意图、总结、答案 | 逐项以正式 Ticket AI 优先，成功 Shadow AI 兜底；同时保留 Shadow 原文和来源。 |
| Shadow 详情 | 意图置信、关键词、证据数量、处理状态/步骤、答案置信、质量提示、时间与版本等已有字段。分析质量警告不等于沟通危险等级。 |
| 可能的回复 | 以已有答案作为人工整理参考，可在当前页面编辑和复制；不是新生成的候选回复，不保证适合直接对外发送。无答案时明确空态。 |
| 风险与决策 | 真实意图、危险等级 1–9、对方要什么、是否立即回复、最佳动作均列于折叠规划区，**未实现**。 |
| 登录 | 已有 Octo 会话直接使用；无会话的 Lark 客户端走 SDK 免登，失败或普通浏览器保留原有登录入口。手动 OAuth 前保存本地 app hash，回调后恢复。 |

## 登录与会话接入

### 登录要求

Ticket AI 必须登录后使用。先检查 `/api/web/profile`；无会话且 UA 为 Lark/Feishu 客户端时加载 H5 SDK，通过 `requestAccess({ appID, scopeList: [] })` 获取授权码。SDK 不支持该 API（缺少方法或 errno=103）时回退 `requestAuthCode`，用户拒绝时不重复弹授权。SDK 加载、授权和请求均有超时，失败后显示手动登录入口。仅有 `workspaceAccess.platformLists` 权限才加载分析页；Ticket 接口独立校验服务端会话和角色，未登录返回 401，无权限返回 403。

免登接口：

- `POST /api/lark/auth/h5/start`：接收 `actionRunId`，返回公开 App ID 和 challengeId，设置 3 分钟 HttpOnly 浏览器凭证 Cookie。
- `POST /api/lark/auth/h5/complete`：接收同一 actionRunId、challengeId 和一次性 code；校验 Origin 与 Cookie，将挑战原子标记为已使用，再向 Lark 验证身份。前端不能指定目标用户 ID。
- Server 按 `tenantKey + openId` 复用用户及角色；冲突用户拒绝登录，新用户无默认平台权限。最小登录授权 token 不覆盖已有广泛 API 授权；沿用现有 HttpOnly Web Session，无新增数据库表。
- `/api/web/profile` 的 `user.id` 为 Octo 用户 ID，`user.larkOpenId` 为该应用下的 Lark open_id，`user.larkTenantKey` 为租户标识。不要把 open_id 与 Lark 的 user_id 或 union_id 混用。业务接口仍从 Cookie 推导身份。

Lark 内免登无需 h5sdk.config 签名。首次使用可能出现授权确认。Server 记录 `LARK_H5_LOGIN_OK` / `LARK_H5_LOGIN_FAILED` 和 actionRunId；不记录 code、Cookie 或原始用户响应。本地合成预览返回模拟已登录 profile，不能用于证明真实免登已验证。

输入框「+ 菜单」与单条消息快捷操作是不同入口：前者文档使用 `getTriggerContext` 获取 `openChatId`，未承诺当前 thread ID；后者才使用 `getBlockActionSourceDetail` 获取所选消息。不能由群聊 ID 推断当前 Ticket，也不能仅增加 H5 签名就声称实现自动定位。

### H5 签名与 openChatId

登录成功后，从页面查询参数 `bdp_launch_query` 的 JSON 中读取 `__trigger_id__`。支持 `chat_action`、`plus_menu_p2p`、`plus_menu_group` 输入框菜单场景；单条消息菜单 `message_action` 显示 `MESSAGE_ACTION_UNSUPPORTED`，本版未实现该入口的 `getBlockActionSourceDetail`。

1. FE 调用 `POST /api/lark/auth/h5/signature`，提交去掉 hash、保留原始 query 编码的页面 URL 及 actionRunId。
2. Server 校验 Web Session、请求 Origin 和 URL 同源；使用已有 App 配置获取 tenant_access_token 和 jsapi_ticket，按到期时间提前失效缓存，同一进程共享并发刷新。每次签名使用新的 nonce 与毫秒 timestamp，只向 FE 返回公开签名参数，不返回票据或 token。
3. FE 调用 `h5sdk.config`，同时等待配置成功和 SDK ready，再调用 `tt.getTriggerContext({ triggerCode })`。SDK/网络调用均有超时，同一用户和启动 URL 的页面切换复用结果。
4. 通过现有 `/api/debug/client-log` 上报 `LARK_APP_OPEN_CHAT_CONTEXT`，包含 openChatId 或安全失败码、场景、actionRunId；不记录触发码、签名 URL、Cookie、票据或原始 SDK 响应。默认查看 `server/logs/popup-client.YYYY-MM-DD.N.log`；以 actionRunId 关联应用日志中的 `LARK_H5_SIGNATURE_OK` / `LARK_H5_SIGNATURE_FAILED`。客户端日志仅用于诊断，不作为可信身份凭据。

页面“当前会话”折叠区展示 ID、失败原因及日志上报状态。日志失败不阻断 Ticket 搜索。普通浏览器、工作台直接打开或手动 OAuth 返回时若启动参数已丢失，需要从输入框应用菜单重新打开。`openChatId` 是会话 ID，不是 thread ID；本版不据此自动匹配 Ticket。

## 后续能力

后续决策字段需明确输出依据、时间范围、置信和人工复核状态；危险等级须先定义业务分级，不能由现有置信度或 warning 数量推导。自动填入/发送消息需单独设计，本轮仅复制。

## 验收

- 已登录有权限：输入标题关键词，选择候选，并在详情中再次搜索切换；核对正式/Shadow 来源、缺失/失败状态、详情展开、草稿复制。
- 未登录：登录后返回原 Ticket 小窗；无权限时沿用工作台权限路由。
- Lark 无会话：确认 start → SDK 授权 → complete → profile 链路，profile 中两个用户 ID 与当前账号一致；重复/过期/跨浏览器挑战被拒绝。用户拒绝或 SDK 不可用时可手动登录。
- 深链接：同一 recordId 位于不同 base/table 时不误选；缺少标识时提示链接不完整。
- Lark 输入框菜单：配置可信域名并部署 FE/Server 后，确认 signature 返回 200，SDK config 成功，页面展示 openChatId；以 actionRunId 核对 Server 签名日志及会话诊断日志。真实客户端和日志落盘尚未验收。
- 普通浏览器、参数缺失、SDK 失败：明确显示诊断状态，标题搜索仍可用；不将群聊 ID 当作 thread/Ticket ID。单条消息菜单获取上下文不作为本版通过项。

参考：[输入框菜单](https://open.larksuite.com/document/client-docs/extensions/message-field-shortcuts-(%E2%80%9C+%E2%80%9D))、[Message Shortcuts](https://open.larksuite.com/document/client-docs/extensions/message-shortcuts)、[Open an H5 app](https://open.larksuite.com/document/common-capabilities/applink-protocol/supported-protocol/open-an-h5-app)。

签名参考：[h5sdk.config](https://open.larksuite.com/document/uYjL24iN/uQjMuQjMuQjM/authentication/h5sdkconfig)、[调试与发布及签名算法](https://open.larksuite.com/document/home/integrating-web-apps-in-5-minutes/debug-and-release)、[获取 JSAPI 临时授权凭证](https://open.feishu.cn/document/authentication-management/access-token/authorization)。
