# Tenways Octo FE

Vite + React login application, styled after the Mosaic React authentication
layout.

```bash
pnpm --dir fe check
pnpm --dir fe dev
pnpm --dir fe build
```

`dev` starts at `http://localhost:4173`; `build` writes deployable static files
to `fe/dist/`.

## 页面按需加载

登录后的业务页面按现有页面模块懒加载；登录与会话检查同步加载。
首次打开页面时显示“正在加载页面…”，加载失败显示刷新按钮，刷新保留当前地址。
页面加载使用 Vite 默认拆包，不提高体积告警阈值。
体积对比与验证证据见[任务记录](../docs/tasks/engineering-ops/2026-09-25-fe-page-lazy-loading.md)。

## Meegle Odoo.sh 构建状态

Meegle 工作项列表和 Sprint 详情页各用一次 `GET /api/web/github-pr-odoo-devops-build?all=true&actionRunId=...`
读取 EU/UK/US 分支构建状态，所有关联 PR 共用页面结果；分组展开和筛选不会按 PR 再次请求。
构建读取独立于列表内容，冷缓存等待时仍可浏览工作项。旧快照显示“旧数据”，环境失败或缺少 headRef 时显示暂不可用；不会自动轮询，刷新页面重新读取。
契约与验证见[Meegle 页面性能任务](../docs/tasks/platform-data/2026-08-29-meegle-page-performance.md)。

## Lark Ticket AI 应用

`#lark-app-thread-analysis` 提供适合 Lark 侧栏的分析页面，复用已有 Ticket AI / Shadow AI；
Ticket 详情页可通过“打开 Ticket AI 小窗”进入。顶部常驻标题搜索框，选择 Ticket 即可查看或切换分析。输入框菜单配置见
[接入说明](docs/lark-ticket-app.md)。

Wiki 后的 `Hermes Agent AI` 页签复用“回答问题”ACP 入口，手动启动、支持追问、工具审批及停止。仅显示当前账号 / Ticket 的 Hermes Answer 会话，与主站详情互通；聊天资料版本/同步时间来自 Server，旧会话不自动刷新材料，需要最新资料时新建对话。页签切换保留当前输入；离开页面不停止已接受的后台任务。新页签不提供业务草稿确认写回按钮。Reasoning、工具步骤与答案分层展示，思考可折叠阅读；Sources 消费 Server 的 `answer.sources` 实时 / 历史事件，按轮次展示回答引用；不从工具记录推断来源，不在 FE 解析 Markdown。
本地模拟交互可运行 `pnpm --dir fe exec node manual-tests/lark-hermes.browser.mjs`（复用 Extension Playwright，浏览器路径配置同下文 Eval 脚本）；[实现与验收记录](../docs/tasks/ai-ticket/2026-10-21-lark-hermes-answer-tab.md)区分 mock 和真实 Hermes / 部署验证。

标题下六项属性（状态、紧急度、需求人、负责人、类型、Business Line）支持有 `platformSync` 权限的用户点击编辑；仅有查看权限时保持只读。复用列表/详情的共享队列，立即回显、允许连续修改，并按字段处理失败回滚和部分成功；搜索切换 Ticket 不串值，修改属性不重置回复草稿。

未关联 Meegle 的 Ticket 支持有 `platformSync` 权限的用户点击“创建 Meegle”，复用现有 Server 创建与链接回写流程。等待属性保存完成后才能开始创建，创建期间暂停该 Ticket 的属性修改并防重复提交；成功后直接显示返回的工作项链接，部分同步失败也保留结果。已有链接只展示“打开 Meegle”；两个入口均紧随“原始讨论”同行显示，窄屏自然换行。状态和结果在当前登录会话内按 Ticket 隔离，搜索切换不会串入其他记录。验证及边界见[创建功能任务](../docs/tasks/platform-data/2026-10-21-lark-app-create-meegle.md)。

Shadow 区支持一键纳入 Eval、标记 Badcase 和编辑标注，复用主站样本。每版 Shadow 独立冻结；Badcase 至少一个失败标签并填写失败原因。主站 Eval 视图可选择历史评测版本；两个入口统一执行并发版本检查，冲突后重读保留已填写修改。
操作区按当前状态突出主操作，已标记 Badcase 统一从“编辑标注”进入。共用表单优先展示标签和原因，分析详情及选填人工标准可展开；已有人工标准自动展开，首次保存因输出更新而重读时自动展开新分析。弹窗正文独立滚动，保存按钮和错误提示保持可见，折叠内容不参与 Tab 导航。
浏览器模拟验收可运行 `pnpm --dir fe exec node manual-tests/lark-ticket-eval.browser.mjs`，复用 Extension 的 Playwright devDependency 和已安装的 Chromium；版本不匹配时通过 `OCTO_EVAL_BROWSER_EXECUTABLE` 指定已有浏览器。该脚本仅使用合成数据和模拟 API，不验证真实免登或部署。

## FE-owned environment configuration

The FE chooses its own API base URL. It does not read the extension's
`SERVER_URL` or `chrome.storage`.

| Environment | `VITE_API_BASE_URL` | Purpose |
| --- | --- | --- |
| development | `/api` | Vite proxies to local Octo API server on port `3040` |
| production | `/api` | Same-origin reverse-proxied BFF/API |

Copy `.env.example` to `.env.local` to override the value without committing
it. Values prefixed with `VITE_` are bundled into browser JavaScript, so they
must never contain credentials.

For a production static deployment, serve `dist/` and reverse proxy `/api` to
the Octo server. A separate API domain needs an explicit CORS policy; same
origin is preferred. See [deployment instructions](docs/deployment.md).

## Lark login boundary

The login button opens Lark OAuth through `GET /api/lark/auth/web/start`.
After the server callback exchanges the one-time authorization code, it finds
or creates the Octo user by `(tenantKey, larkUserId)`, stores the Lark token
server-side, and returns an opaque `HttpOnly; SameSite=Lax` web-session cookie.
The FE calls `/api/lark/auth/web/ensure` and `/api/web/profile` with that
cookie. The profile exposes verified `user.id` (Octo), `user.larkOpenId`, and
`user.larkTenantKey`; these are identifiers, not credentials. The FE never supplies
an identity header to select its user and never receives a Lark token, Meegle cookie, or
Chrome extension data. A Lark token that cannot be refreshed is shown as
"需要重新授权" on the personal page; it does not invalidate the Octo Web session.

The `#lark-app-thread-analysis` page also supports H5 SDK login inside the Lark client. If no Web
Session exists, it loads the official SDK, calls `requestAccess` (or the legacy
`requestAuthCode` fallback), and uses `POST /api/lark/auth/h5/start` and
`POST /api/lark/auth/h5/complete` to establish the same cookie. The server binds the
one-time challenge to an HttpOnly browser proof and checks the configured Web
origin. Minimal login tokens never replace existing API authorization. Ordinary
browsers and failed automatic logins retain the normal login buttons. After login, users select a Ticket by title or number. The app does not collect
chat context or request JSAPI signing. See [the app guide](docs/lark-ticket-app.md).

The Meegle card reads only the sanitized `meegleAuthorization.status` from
`/api/web/profile`. The server checks its stored Meegle credential without
refreshing it; the FE never receives a Meegle token, cookie, user key, base URL,
or authorization time. When authorization is required, users complete it in
the Octo plugin on a Meegle page.

Configure the server callback with the shared FE/API origin:

```bash
LARK_OAUTH_CALLBACK_URL=https://octo.example.com/api/lark/auth/callback
```

Register `LARK_OAUTH_CALLBACK_URL` in the Lark application. The server derives
the Web redirect and credentialed-CORS origin from this URL; FE and API must be
served on the same origin.

The extension package has exact built-in matches for the current `prod`,
`test`, and `dev` Octo server origins. Its active environment must match the
current FE/API origin before it can approve a plugin login:

```bash
pnpm --dir extension build
```

This does not add a broad web permission or read any browser cookie.

## Local plugin-login verification

For local browser verification, keep the browser-facing origin at
`http://localhost:4173`. Vite proxies `/api/*` to the local Octo server at
`http://localhost:3040`, so the FE and HttpOnly session cookies remain
same-origin in the browser.

```bash
LARK_OAUTH_CALLBACK_URL=http://localhost:4173/api/lark/auth/callback PORT=3040 pnpm --dir server dev
pnpm --dir fe dev
```

Reload the unpacked extension, choose `dev` in its settings, and set its
custom `SERVER_URL` to `http://localhost:4173`. The extension accepts this as a
custom dev URL and its localhost content-script match covers port `4173`.

To exercise plugin login successfully, the local server database needs the
current plugin user's active Lark authorization. Real Lark OAuth callback
verification additionally requires that the Lark app accepts the localhost
callback URL; otherwise use the test deployment for that E2E case.

## Lark Ticket 客服浮窗

已登录的 Ticket 列表、详情和 Lark App 分析页异步加载 WeKnora SDK，并通过现有 embed-token 接口检查服务可用性。两者均成功后显示图标；8 秒内未完成、请求失败或返回无效时不显示，不阻塞页面。离开这些页面或退出登录时销毁浮窗。
FE 经现有 API base 调用 `GET /api/weknora/embed-token`，服务端另提供 `/weknora/embed-token`。
服务端必须设置 `WEKNORA_PUBLISH_TOKEN`，不得添加 `VITE_` 前缀。
`WEKNORA_EMBED_ORIGIN` 设置为 FE 对外 origin（协议、域名和端口）；未设置则取
`LARK_OAUTH_CALLBACK_URL` 的 origin。WeKnora 频道 allowed_origins 必须允许该 origin。
修改服务端环境变量后需重启。测试环境与生产环境分别配置。
本接入不自动向 WeKnora 发送 Ticket 内容。详见[任务记录](../docs/tasks/ai-ticket/2026-09-25-lark-app-weknora.md)。

## Wiki 问答阶段进度

Wiki 问答复用现有 Ticket AI SSE，接收 `wiki_qa.progress` 事件。`data` 包含
`actionRunId`、`layer`、`module`、`stage`、`phase`、`status`、`message`，失败时可有 `errorCode`。
阶段为 `extract/retrieve/rerank/evidence/answer`；状态为 `started/completed/failed/cancelled`。
FE 为每次运行的每个阶段显示一条状态，完成后更新原条目；与最终答案分开，复制答案不包含进度。
运行记录保存这些事件，重开时可还原；仍以最终 `done` 事件判断本轮完成。
没有候选时会跳过重排和证据筛选。阶段事件不包含原始问题、聊天、提示词或模型思考。

## Ticket 字段连续编辑

Ticket 列表、详情属性及 Lark App 属性栏在选值后立即关闭菜单、回显并显示保存中，可以连续修改。App 按登录用户及 API 地址持有共享队列；同一 Ticket 请求依次发送，失败只恢复对应字段到最后已确认值，旧响应不会整条覆盖更新的修改。详情导航缓存同步更新，列表请求按编辑版本隔离并发复用。解决方案提交共用该队列。Lark 已写但本地同步失败时保留新值并提示；退出登录取消未发送修改。队列仅在当前页面会话内有效，未提供刷新后的持久化恢复。

Server 元数据缓存及减少远端读取的契约、模拟浏览器检查入口和真实平台验证边界见[任务记录](../docs/tasks/platform-sync/2026-10-21-lark-ticket-edit-sync-performance.md)。

## 共享颜色主题

`src/styles/global.css` 定义基础色、语义色和组件色三层变量。主操作使用琥珀品牌色，辅助信息使用青绿，正文/背景/边框使用中性色，业务状态使用独立状态色。组件优先引用语义变量，已有变量保留兼容映射。具体用法及 Lark App 应用范围见 [配色说明](docs/lark-ticket-app.md#颜色变量维护)。


## Shadow Wiki 参考

Shadow 分析展示服务端返回的 Wiki 状态：已参考资料、未召回相关资料，或“Wiki 不可用，本次仅基于聊天分析”。来源使用 `[W1]` 标记，展示标题、仓库相对来源路径、草稿/历史参考状态及适用限制；新结果可来自 `docs/llm-wiki/...` 或只读 `docs/ontology/...`，旧结果的 `concepts/...` 相对路径继续按 llm-wiki 展示。原始 Wiki 摘录不通过 Shadow Web 投影返回。旧记录无 Wiki 字段时保持原展示。正式问题总结本轮只共用 thread 处理，不增加 Wiki 召回。
