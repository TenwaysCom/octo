# Ticket AI 输入框菜单应用

本地页面：`http://localhost:4173/#lark-app-thread-analysis`。部署后使用 FE 的同源地址。页面复用 Web Session 和平台列表权限，通过既有 GET 接口读取 Ticket；用户手动点击后，复用现有 AI Session 接口执行 Wiki 问答。保留 H5 SDK 免登；v13 已移除 openChatId 采集、签名请求和会话诊断展示，通过标题/编号搜索选择 Ticket。

选中 Ticket 后，标题下属性栏支持编辑状态、紧急度、需求人、负责人、类型与 Business Line；仅 `workspaceAccess.platformSync` 为真时显示编辑按钮，其他用户只读。选项由既有 `GET /api/web/lark-tickets/field-options` 提供，写入复用 `POST /api/web/lark-tickets/:recordId/fields`，服务端仍独立鉴权。

选值后立即回显并关闭菜单，同一 Ticket 按序提交，其他字段可以继续选择。与主站共用 App 会话内队列，失败只回滚对应修改，旧完整响应不覆盖后续值；Lark 已写但本地同步失败时保留新值并提示。搜索切换 Ticket 后在途操作继续，状态和错误按完整 Base/Table/Record 标识隔离；修改属性不会重置回复草稿或切换 AI 页签。读取请求沿用编辑版本门禁，未提供刷新后的待发送修改持久化恢复。

标题信息区在“原始讨论”旁同行提供“创建 Meegle”（窄屏自然换行）：仅有 `platformSync` 权限且没有已有 Meegle 关联时可用，复用 `POST /api/web/lark-tickets/:recordId/create-meegle-workitem` 并提交 actionRunId。先等待属性保存完成，创建期间暂停同 Ticket 的属性修改并复用在途请求，搜索切换后仍保留创建状态。类型映射、平台创建和 Lark 链接回写均由既有 Server workflow 负责。

创建成功后显示“打开 Meegle”，多项结果分别展示链接，不重新创建已完成结果。`syncFailed` 时保留链接并提示 Octo 同步失败；失败不自动重试。已有链接直接显示打开入口；Server 返回 `MEEGLE_LINK_ALREADY_EXISTS` 时阻止再次创建，提供显式重新读取 Ticket 的入口。仅展示 HTTP(S) 链接，无写权限的用户仍可打开已有链接。创建状态仅在当前登录会话内有效，未增加服务端幂等能力或跨进程 exactly-once 保证。

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
| Ticket 属性栏 | 选中 Ticket 后，标题下依次显示 Ticket 编号、状态、紧急度、需求人、负责人、类型、Business Line，随后显示同步时间及完整详情、原始讨论链接，Meegle 操作紧随原始讨论同行展示。六项属性有写权限时可点选编辑；使用已有搜索选项浮层、徽标和人员组件，保留 title 提示；人员为空显示“-”，其他属性沿用组件空态。窄屏自动换行。 |
| 当前 thread → Ticket | **未接入**；本版采用手动搜索选择，无需 thread 添加链接。保留已有深链接的三元组定位能力。 |
| 数据读取 | 复用 `GET /api/web/platform-data/lark-tickets` 及既有分页实现，精确匹配 baseId/tableId/recordId。当前接口不能按消息 ID 查询；没有新增接口。 |
| AI 诉求理解 | 卡片顶部紧凑展示意图及自评分，分隔线下将诉求摘要标签与正文同行展示，以较大字号/行距显示完整摘要，长正文在右侧自然换行；说明 i 图标靠标题栏右侧，不新增常驻说明行。公共区展示意图推断和诉求摘要，优先使用成功 Shadow 的分类与意图摘要；没有成功 Shadow 时意图使用 Ticket AI。摘要不足时展示已有问题摘要并标明诉求待确认，空值显示待确认。来源一致时在“AI 诉求理解”标题后统一显示来源 badge，字段不重复标注；混合来源仍逐项标注。移除公共区“分析更新”时间行；标题旁 i 图标 hover/focus tooltip 展示推断与待确认事项提示；公共意图旁显示同一成功 Shadow 的意图自评分，不将其用于 Ticket AI 来源或回复草稿。相同摘要只展示一次，不自动推导期望结果或交付物。 |
| 分析页签 | 顺序为“Shadow AI”“WIKI Rag AI”“Hermes Agent AI”。默认“Shadow AI”，不自动调用模型；“Shadow AI”仅展示 Shadow AI，不再展示独立 Ticket AI 卡片。切换页签保留本地草稿与当前运行，首次进入 Hermes 才读取其会话；必要审批仅在 Hermes 页签可见时滚动定位。标签以品牌色背景、底线和加粗显示选中状态，支持方向键/Home/End；主按钮、链接、焦点和标签页共用 Octo 的品牌色 token。 |
| Hermes 问答 | 手动点击“回答问题”复用 `lark-ticket-support-qa-answer`，在原会话追问或新建对话。仅列出当前账号 / Ticket 的 Hermes Answer 会话，默认恢复最近一条，旧 Kimi 会话留在主站；来源由服务端 ownership / runtime 元数据提供，客户端不猜 ID。对话按用户轮次分为问题、Hermes 回答、处理过程。答案支持 Markdown，每轮集中一个复制按钮；Reasoning 单独默认折叠，展开可阅读已有原生思考，长内容区内滚动，复制回答不含思考；工具步骤汇总进独立默认折叠的状态列表，审批卡片独立可见，保留停止。复制按钮固定尺寸与零 padding，不受通用按钮样式挤压；提交后按钮显示“正在回答…”，输入区旁显示提交、处理、待确认或停止状态，即使尚无答案正文也有等待反馈，不提供业务草稿确认写回。 |
| Hermes 引用来源 | Answer 完成后，Server 发出结构化 `answer.sources` SSE 事件，并由现有运行快照保留；加载原生历史时 Server 按用户轮次补齐同一事件。FE 直接消费 `sources`，不解析 Markdown 猜来源。支持正文内明确链接、知识库绝对 / 相对文档路径、引用段落 / 脚注和 `case:...` source_ref，按目标去重；无引用的追问为空，不沿用上一轮。只有 http(s) 来源可打开，文档路径 / 案例标识只展示；不读取文件或抓取远端。来源标记 `provenance=answer_reference`，表示回答引用，不声称已核验。正文 `[1]` 的 inline citation 映射按用户确认暂不处理，保留原文，不自动配号或跳转。 |
| Hermes 资料与恢复 | 显示创建会话时关联聊天的版本及同步时间；追问不重新注入 Ticket / 聊天，新对话重新走既有材料准备。切页签保留未发送输入，切换 Ticket 不串内容；断线恢复实际运行状态，不自动重发任务，失败保留输入。离开页面不停止已接受任务，恢复受原生历史、进程内快照及既有超时约束。 |
| Wiki 即时分析 | 手动执行 `lark-ticket-wiki-qa`，沿用 AI Session 启动/列表/加载/停止接口及 actionRunId。支持阶段进度、Markdown 答案（标题、列表、表格、代码与安全链接）、复制、停止和失败后新运行重试。不提供续聊，也不覆盖公共诉求或本地草稿。 |
| Wiki 历史 | 仅展示服务端返回的当前用户/当前 Ticket 下 Wiki 运行，按 updatedAt 倒序；可重开结果或恢复运行进度。运行记录沿用现有服务端保留周期，不是永久历史。加载失败不阻断已有分析；切换 Ticket 隔离晚到响应，已接收的任务继续由服务端管理。 |
| Shadow 详情 | 默认预览意图、关键词、问题总结、方案摘要，缺值显示“暂无信息”。意图与方案摘要旁分别展示浅青绿色“AI 自评 xx%”徽标，鼠标悬停或键盘聚焦显示 tooltip，说明未经正确率校准、需结合证据与时效核对；不再点击展开新行。方案自评分明确不代表回复草稿可信度；不设置高/中/低阈值或红黄绿风险色。评分缺失或不在 0–1 范围时不显示徽标。证据数量、意图摘要、处理状态/步骤、质量提示、版本等收进“展开更多信息”，默认折叠；失败/跳过状态保留在标题，原因和诊断可展开查看。Shadow 分析时间紧随卡片标题/状态展示，不在折叠详情或页尾重复。分析质量警告不等于沟通危险等级。 |
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

### 创建 Meegle 工作项

- 有 platformSync 权限且无链接：等待属性保存完成后点击创建，创建期间不能重复点击或修改该 Ticket 属性；请求携带 baseId/tableId/actionRunId。
- 搜索切到其他 Ticket 再返回：显示原记录的创建状态；成功时只更新原记录，不影响当前其他 Ticket，回复草稿不因同 Ticket 创建结果而重置。
- 成功后显示所有返回链接；部分同步失败时仍保留结果与链接，不重新提供创建按钮。链接只接受 HTTP(S)。
- 创建失败显示原因，明确点击才重试。Server 返回已有链接时显示重新读取入口，不重复创建；已有关联的只读用户仅显示打开链接。
- 本地模拟检查与属性编辑共用 `node fe/manual-tests/lark-ticket-field-edits.browser.mjs`，真实 Lark/Meegle 写入及部署状态以[任务记录](../../docs/tasks/platform-data/2026-10-21-lark-app-create-meegle.md)为准。

### 属性编辑

- 有 `platformLists` 和 `platformSync` 权限：选中 Ticket，六项属性均可点选、搜索选项并保存；连续修改时立即回显，提示待保存数量。无写权限不显示编辑按钮。
- 连续修改不同字段或同一字段，延迟返回旧响应，再让后续操作失败：只回滚对应字段到最后已确认值，保留其他字段的新值。人员写入携带选项的 userId。
- 保存中搜索切换到其他 Ticket，再返回：值和失败提示不串记录；Lark 已写但本地同步失败时保留新值并提示部分成功。已输入的回复草稿不因同一 Ticket 属性更新而重置。
- 390px 窄屏可打开浮层、搜索及选值，页面不产生横向溢出。模拟检查入口：`node fe/manual-tests/lark-ticket-field-edits.browser.mjs`；需要时用 `OCTO_FIELD_BROWSER_EXECUTABLE` 指定已安装 Chromium。

### Shadow Eval 标注

Shadow AI 区展示当前结果的“未标记 / Draft / Eval / Badcase”、最近标注人和时间。一键“纳入 Eval”立即保存；“标记 Badcase”打开表单，至少选择一个失败标签并填写 1–4000 字的失败说明，保存前不写数据。“编辑标注”可改状态、原因、标签及选填的人工意图/期望结果；切回 Eval 保留已填内容。

操作区按状态收敛：未标记显示“纳入 Eval / 标记 Badcase”，已有样本以“编辑标注”为主，已是 Badcase 时不重复展示原因编辑按钮；右侧图标可重新读取。共用编辑器把标签和原因放在前面，原因显示字数；分析详情默认收起，选填人工标准已有内容时展开。首次保存因输出更新而重读时自动展开新分析供核对。正文独立滚动，底部保存与错误提示常驻；折叠区支持键盘展开，隐藏字段不参与 Tab 导航。

仅成功且带线程快照版本的 Shadow 结果可评价。每版输出独立冻结，Wiki 回答、人工回复草稿不属于该入口的评价对象。首次保存时结果或线程快照已改变会拒绝，保留输入，需重新核对；线程材料变化时需重新分析。历史样本可以从主站 Eval 的版本选择器打开，不自动套用最新 Shadow。

Lark 和主站共享样本与编辑器，均要求 Web Session 和 platformLists 权限。已成功的同一次请求重试不重复写入；过期编辑返回冲突，必须显式重新读取。重读保留本地修改、合并未编辑的最新字段，并展示最新标注供核对。只记录最新原因与参与归属，不提供历次原因正文。

接入接口：`GET/POST /api/web/lark-tickets/:recordId/shadow-eval-sample`；编辑沿用 `PUT /api/web/lark-ticket-eval-samples/:sampleId` 并提交 `expectedUpdatedAt`。新读写携带 actionRunId；接口和发布兼容性见 [Eval 契约](../../docs/ai-dev/2026-09-01-lark-ticket-ai-output-and-eval-dataset-prd.md#shadow-eval-版本与保存契约)。

- 普通样本一键加入，Badcase 填写后提交，取消不写入；刷新和主站回读一致。
- 结果重跑后显示未标记；旧结果的原因和冻结内容仍可从主站版本选择器查看、编辑标注。
- A/B 或跨入口并发，后到的过期表单不能覆盖；重读保留输入，同次断网重试复用请求 ID。
- 无权限、无成功输出、非法标签或空原因拒绝；390px 窄屏表单可滚动、标签和操作可达。

- 已登录有权限：输入标题关键词，选择候选，并在详情中再次搜索切换；核对公共诉求来源和提示、属性栏同步时间与 Shadow 标题分析时间、已有分析只显示 Shadow AI、缺失/失败状态与草稿复制。默认 Shadow AI 页签不触发模型；手动运行、停止、重试和历史重开不覆盖草稿。
- 模拟运行：验证阶段进度、Markdown 长文/表格/代码的窄屏显示、仅复制答案；历史与执行 403 单独提示，切换 Ticket 时晚到的历史/事件不串入新 Ticket。
- 未登录：登录后返回原 Ticket 小窗；无权限时沿用工作台权限路由。
- Lark 无会话：确认 start → SDK 授权 → complete → profile 链路，profile 中两个用户 ID 与当前账号一致；重复/过期/跨浏览器挑战被拒绝。用户拒绝或 SDK 不可用时可手动登录。
- 深链接：同一 recordId 位于不同 base/table 时不误选；缺少标识时提示链接不完整。
- Lark 输入框菜单：登录后进入标题/编号搜索；页面不显示会话诊断，也不发出 H5 signature 或 LARK_APP_OPEN_CHAT_CONTEXT 请求。
- 普通浏览器或缺少菜单参数：沿用登录、搜索和深链接流程，不依赖聊天上下文。

参考：[输入框菜单](https://open.larksuite.com/document/client-docs/extensions/message-field-shortcuts-(%E2%80%9C+%E2%80%9D))、[Message Shortcuts](https://open.larksuite.com/document/client-docs/extensions/message-shortcuts)、[Open an H5 app](https://open.larksuite.com/document/common-capabilities/applink-protocol/supported-protocol/open-an-h5-app)。

签名参考：[h5sdk.config](https://open.larksuite.com/document/uYjL24iN/uQjMuQjMuQjM/authentication/h5sdkconfig)、[调试与发布及签名算法](https://open.larksuite.com/document/home/integrating-web-apps-in-5-minutes/debug-and-release)、[获取 JSAPI 临时授权凭证](https://open.feishu.cn/document/authentication-management/access-token/authorization)。

Lark App 采用琥珀/青绿双配色：Logo、主按钮和选中态沿用 `--octo-brand`（#B45309）；字段名称、信息图标、来源和 AI 自评标签使用 `--octo-info-text`（#0F766E），信息浅底为 #F0FDFA。人工整理保留浅品牌色；颜色不随评分高低变化。公共主题采用统一中性色：正文 #1E293B、辅助文字 #64748B、页面 #F8FAFC、卡片白色、边框 #E2E8F0。警告使用金黄色，成功与失败保留独立状态色。

字段名称（意图推断、诉求摘要及其他详情 label）统一使用主题青绿 `--octo-info-text`、略加粗，与正文和浅品牌色 badge 区分。

### 颜色变量维护

`src/styles/global.css` 按基础色（如 `--octo-teal-700`）、语义色（如 `--octo-info-text`）和组件色（如 `--octo-field-label-color`、`--octo-source-badge-bg`）分层。组件优先引用语义或组件变量，不直接引用色值。`--octo-text`、`--octo-text-muted` 与已有 teal badge 变量保留兼容映射。

主按钮/选中态使用品牌色，字段和 AI 信息使用青绿，时间/普通属性使用中性色，人工整理使用浅品牌色。AI 自评不随分数变色。修改公共语义变量会同步影响主站中引用它的区域；Lark App 的颜色已统一接入，其他页面遗留硬编码不在本次逐项迁移范围内。
