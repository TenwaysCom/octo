# Ticket AI 输入框菜单应用

本地页面：`http://localhost:4173/#lark-app-thread-analysis`。部署后使用 FE 的同源地址。页面复用 Web Session 和平台列表权限，通过既有 GET 接口读取 Ticket；用户手动点击后，复用现有 AI Session 接口执行 Wiki 问答。保留 H5 SDK 免登；v13 已移除 openChatId 采集、签名请求和会话诊断展示，通过标题/编号搜索选择 Ticket。

## 开发者后台配置

1. 在目标自建应用启用网页应用能力，将首页设为 `<Octo FE origin>/#lark-app-thread-analysis`。应用域名应与现有 OAuth 回调和 `/api` 同源部署相符。
2. 构建部署 FE 和 Server，确认页面与 `/api` 同源，且该 origin 与 Server 的 `LARK_OAUTH_CALLBACK_URL` 一致；H5 免登入口会严格检查 Origin。App ID 从 Server 下发，App Secret 只保留在 Server。SDK 使用官方免登示例的固定 1.5.26 版本，部署环境需允许加载对应 CDN。当前页面只使用免登 SDK，不为获取会话上下文调用 JSAPI 签名。
3. 在 **Features → Extensions → Message Field Shortcuts（输入框 + 菜单）** 启用入口，名称建议“查看 Ticket AI”。桌面入口填写：

   ```text
   https://applink.larksuite.com/client/web_app/open?appId=<cli_app_id>&mode=sidebar&lk_target_url=<encodeURIComponent(完整页面URL)>
   ```

   完整页面 URL 是 `<Octo FE origin>/#lark-app-thread-analysis`。包含 `#` 的地址使用 `lk_target_url`，不能放在 `path`。协议及域名需与应用首页一致。进入后，在顶部搜索框输入 Ticket 标题关键词，点击候选查看分析；详情中也可继续搜索切换。
4. 完成应用版本发布，在已批准的可用范围内验证消息菜单入口。本文仅提供配置，不代表后台已创建/发布应用。

若应用首页已经直接配置为 `/#lark-app-thread-analysis`，输入框菜单可省略 `lk_target_url`，使用 `web_app/open?appId=<cli_app_id>&mode=sidebar`。若保留现有工作台首页，则仍使用上述 `lk_target_url` 指定分析页。不要把本地合成数据验证端口作为线上应用地址。

### 客户端侧栏宽度

页面 CSS 的 `width: 100%` 仅填满客户端容器，不能控制 Lark 原生侧栏的大小。若整个侧栏无法拖宽，可在原菜单 AppLink 的顶层 query 中增加 `min_width=560&max_width=1000`，不要放进 `lk_target_url`：

```text
https://applink.larksuite.com/client/web_app/open?appId=<cli_app_id>&mode=sidebar&min_width=560&max_width=1000&lk_target_url=<encodeURIComponent(完整页面URL)>
```

[飞书官方协议](https://open.feishu.cn/document/common-capabilities/applink-protocol/supported-protocol/open-an-h5-app)明确列出这两个侧栏参数：7.9 起支持，默认值均为 350，最大不超过客户端窗口宽度。2026-09-23 核对时 Lark 国际版对应文档尚未列出，以上为待验证的 Lark 配置方案，不能宣称已在国际版生效。需修改开发者后台菜单入口、按平台要求发布，并关闭原侧栏重新从菜单打开验证；本仓库没有自动更新后台入口的逻辑。

## 本轮能力及边界

| 项目 | 行为 |
| --- | --- |
| 菜单场景 | 识别 `message_action`、`chat_action`、`plus_menu_p2p`、`plus_menu_group` 启动场景；无 hash 时进入应用页。建议入口 URL 显式指定 `#lark-app-thread-analysis`。 |
| 品牌 Logo | 顶部复用 Octo 工作台 BrandMark 四格图标及全局品牌样式，保留 Ticket AI / Octo · 讨论助手文案。 |
| 用户信息 | 顶部右侧只展示当前账号头像与姓名，复用 Octo 头像组件，无点击入口或下拉菜单。替代原顶部刷新按钮，Ticket 加载失败仍可重试。 |
| 标题搜索 | 顶部常驻小搜索框，按标题或编号进行不区分大小写的包含匹配，显示最多 20 个候选及总数；无结果有提示。点选后显示分析，Escape 或失焦收起候选。 |
| Ticket 信息 badge | 选中 Ticket 后，标题下属性栏依次显示 Ticket 编号、状态、Issue 类型、负责人、Business Line，随后显示同步时间，最后为完整详情和原始讨论链接；去掉属性前的文字标签，保留 title 提示及已有徽标/人员组件；缺失状态/类型/业务线显示“未设置”，负责人为空显示“未分配”，窄屏自动换行。 |
| 当前 thread → Ticket | **未接入**；本版采用手动搜索选择，无需 thread 添加链接。保留已有深链接的三元组定位能力。 |
| 数据读取 | 复用 `GET /api/web/platform-data/lark-tickets` 及既有分页实现，精确匹配 baseId/tableId/recordId。当前接口不能按消息 ID 查询；没有新增接口。 |
| AI 诉求理解 | 公共区展示意图推断和诉求摘要，优先使用成功 Shadow 的分类与意图摘要；没有成功 Shadow 时意图使用 Ticket AI。摘要不足时展示已有问题摘要并标明诉求待确认，空值显示待确认。保留各自来源，移除公共区“分析更新”时间行；标题旁 i 图标 hover/focus tooltip 展示推断与待确认事项提示；公共意图旁显示同一成功 Shadow 的意图自评分，不将其用于 Ticket AI 来源或回复草稿。相同摘要只展示一次，不自动推导期望结果或交付物。 |
| 两个页签 | 两个页签命名为“Shadow AI”和“WIKI Rag AI”。默认“Shadow AI”，不自动调用模型；“Shadow AI”仅展示 Shadow AI，不再展示独立 Ticket AI 卡片。切换页签保留本地草稿与当前运行。标签以品牌色背景、底线和加粗显示选中状态，支持方向键/Home/End；主按钮、链接、焦点和标签页共用 Octo 的品牌色 token。 |
| Wiki 即时分析 | 手动执行 `lark-ticket-wiki-qa`，沿用 AI Session 启动/列表/加载/停止接口及 actionRunId。支持阶段进度、Markdown 答案（标题、列表、表格、代码与安全链接）、复制、停止和失败后新运行重试。不提供续聊，也不覆盖公共诉求或本地草稿。 |
| Wiki 历史 | 仅展示服务端返回的当前用户/当前 Ticket 下 Wiki 运行，按 updatedAt 倒序；可重开结果或恢复运行进度。运行记录沿用现有服务端保留周期，不是永久历史。加载失败不阻断已有分析；切换 Ticket 隔离晚到响应，已接收的任务继续由服务端管理。 |
| Shadow 详情 | 默认预览意图、关键词、问题总结、方案摘要，缺值显示“暂无信息”。意图与方案摘要旁分别展示浅品牌色“AI 自评 xx%”徽标，鼠标悬停或键盘聚焦显示 tooltip，说明未经正确率校准、需结合证据与时效核对；不再点击展开新行。方案自评分明确不代表回复草稿可信度；不设置高/中/低阈值或红黄绿风险色。评分缺失或不在 0–1 范围时不显示徽标。证据数量、意图摘要、处理状态/步骤、质量提示、版本等收进“展开更多信息”，默认折叠；失败/跳过状态保留在标题，原因和诊断可展开查看。Shadow 分析时间紧随卡片标题/状态展示，不在折叠详情或页尾重复。分析质量警告不等于沟通危险等级。 |
| 回复草稿 | 位于“Shadow AI”页签顶部，复制回复按钮紧随标题，仅在该页签显示；切换页签保留本地编辑。以已有答案作为人工整理参考，可在当前页面编辑和复制；不是新生成的候选回复，不保证适合直接对外发送。无答案时明确空态。 |
| 风险与决策 | 危险等级 1–9、是否立即回复、最佳动作保留折叠规划区，**未实现**；不得由置信度换算风险。公共诉求仅复用已有分析，不新增结构化判断。 |
| 登录 | 已有 Octo 会话直接使用；无会话的 Lark 客户端走 SDK 免登，失败或普通浏览器保留原有登录入口。手动 OAuth 前保存本地 app hash，回调后恢复。 |

即时分析依据本次取得的材料，不持续监听讨论。页面显示接口实际返回的运行更新时间；不以 Ticket 同步时间冒充快照时间，不展示接口未提供的材料版本。回复草稿沿用已有 Ticket AI 答案优先、成功 Shadow 兜底，切换 Ticket 重置；模型答案只提供单独复制。

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

### 会话上下文

openChatId 标识会话，无法确认用户当前查看的话题。页面不再调用 getTriggerContext、H5 签名接口或上报会话诊断；不展示会话 ID、诊断错误码及重新打开菜单的提示。通过标题或编号搜索选择 Ticket，已有 Ticket 深链接仍可直接打开。

Server 的 `/api/lark/auth/h5/signature` 接口保持现状，本页面已无调用。历史采集与诊断证据见任务记录。

## 后续能力

后续决策字段需明确输出依据、时间范围、置信和人工复核状态；危险等级须先定义业务分级，不能由现有置信度或 warning 数量推导。自动填入/发送消息需单独设计，本轮仅复制。

## 验收

- 已登录有权限：输入标题关键词，选择候选，并在详情中再次搜索切换；核对公共诉求来源和提示、属性栏同步时间与 Shadow 标题分析时间、已有分析只显示 Shadow AI、缺失/失败状态与草稿复制。默认 Shadow AI 页签不触发模型；手动运行、停止、重试和历史重开不覆盖草稿。
- 模拟运行：验证阶段进度、Markdown 长文/表格/代码的窄屏显示、仅复制答案；历史与执行 403 单独提示，切换 Ticket 时晚到的历史/事件不串入新 Ticket。
- 未登录：登录后返回原 Ticket 小窗；无权限时沿用工作台权限路由。
- Lark 无会话：确认 start → SDK 授权 → complete → profile 链路，profile 中两个用户 ID 与当前账号一致；重复/过期/跨浏览器挑战被拒绝。用户拒绝或 SDK 不可用时可手动登录。
- 深链接：同一 recordId 位于不同 base/table 时不误选；缺少标识时提示链接不完整。
- Lark 输入框菜单：登录后进入标题/编号搜索；页面不显示会话诊断，也不发出 H5 signature 或 LARK_APP_OPEN_CHAT_CONTEXT 请求。
- 普通浏览器或缺少菜单参数：沿用登录、搜索和深链接流程，不依赖聊天上下文。

参考：[输入框菜单](https://open.larksuite.com/document/client-docs/extensions/message-field-shortcuts-(%E2%80%9C+%E2%80%9D))、[Message Shortcuts](https://open.larksuite.com/document/client-docs/extensions/message-shortcuts)、[Open an H5 app](https://open.larksuite.com/document/common-capabilities/applink-protocol/supported-protocol/open-an-h5-app)。

签名参考：[h5sdk.config](https://open.larksuite.com/document/uYjL24iN/uQjMuQjMuQjM/authentication/h5sdkconfig)、[调试与发布及签名算法](https://open.larksuite.com/document/home/integrating-web-apps-in-5-minutes/debug-and-release)、[获取 JSAPI 临时授权凭证](https://open.feishu.cn/document/authentication-management/access-token/authorization)。

标签配色复用 Octo 品牌变量：来源标签（如 Shadow AI）使用浅品牌实底，人工整理使用更淡的底色与细边框，AI 自评使用浅底与较明显细边框并支持悬停/聚焦 tooltip。颜色不随评分高低变化。
