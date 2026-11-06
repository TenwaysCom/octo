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

标题下六项属性（状态、紧急度、需求人、负责人、类型、Business Line）支持有 `platformSync` 权限的用户点击编辑；仅有查看权限时保持只读。复用列表/详情的共享队列，立即回显、停手 1 秒按 Ticket 合并保存，最长等 3 秒；冲突和明确失败保留草稿，支持核对及同步恢复；搜索切换 Ticket 不串值，修改属性不重置回复草稿。

未关联 Meegle 的 Ticket 支持有 `platformSync` 权限的用户点击“创建 Meegle”，复用现有 Server 创建与链接回写流程。等待属性保存完成后才能开始创建，创建期间暂停该 Ticket 的属性修改并防重复提交；成功后直接显示返回的工作项链接，部分同步失败也保留结果。已有链接只展示“打开 Meegle”；两个入口均紧随“原始讨论”同行显示，窄屏自然换行。状态和结果在当前登录会话内按 Ticket 隔离，搜索切换不会串入其他记录。验证及边界见[创建功能任务](../docs/tasks/platform-data/2026-10-21-lark-app-create-meegle.md)。

Meegle 操作后提供“打开 Lark Base”，在新标签页打开当前 Ticket 的 Base 记录。已有共享链接直接使用；缺失时通过既有接口读取，失败可点击重试。查看用户也可使用，窄屏自然换行。验证见[入口任务](../docs/tasks/platform-data/2026-11-06-lark-ticket-app-open-base.md)。

链接读取和属性保存区分源记录不存在、权限不足及授权不可用。源记录不存在时提示“可能已被删除”并暂停该 Ticket 后续属性修改。有 `platformSync` 权限的用户可在小窗和完整详情点击“标记删除 Octo Ticket”，确认后从普通列表和搜索中隐藏，保留历史数据。操作仅影响 Octo；详情与验证见[任务记录](../docs/tasks/platform-data/2026-11-06-lark-ticket-source-errors-and-deletion.md)。

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

Ticket 列表、详情及 Lark App 的需求人/负责人徽章使用 Server 返回的 `requesterPeople`、`responsiblePeople`：人员 `userId` 来自 Ticket 源人员对象，`avatarUrl` 来自 `lark_contacts`，只按 open ID 匹配。缺少缓存或图片加载失败时保留姓名首字；旧接口仅返回姓名字符串时仍可显示。现有头像尺寸、标签及列表筛选保持；字段编辑时人员数组与姓名一起回显、确认和回滚，不沿用上一位人员的头像。

点击人员展开的选择列表也使用相同头像缓存：既有 `field-options` 接口的人员选项增加可选 `avatarUrl`，Server 一次批量查询并按 `userId` 匹配。列表菜单、详情及 App 属性菜单均保留 16px 尺寸、搜索和选中行为，缺失或图片失败时回退首字；不按姓名推断头像。

可运行 `OCTO_FIELD_BROWSER_EXECUTABLE=<已有 Chromium 路径> pnpm --dir fe exec node manual-tests/lark-ticket-avatars.browser.mjs` 验证列表、详情、窄屏 App、图片失败及失败草稿放弃后的头像恢复；全部使用合成 API/图片，真实库只读及部署边界见 [头像展示任务](../docs/tasks/platform-data/2026-11-06-lark-ticket-contact-avatars.md)。

Ticket 列表、详情及 Lark App 六属性在选值后立即回显，停手 1 秒合并提交，连续编辑最长等 3 秒。同字段最后选择生效、改回基线不请求；发送中仍可编辑下一批，旧响应不能覆盖新选择。App 按登录用户、API 地址和完整 Base/Table/Record 隔离队列，列表及导航缓存同步投影。

草稿与提交编号写入 sessionStorage，刷新先核对已发批次和最新 Lark 数据再恢复；换账号不续发旧账号草稿，退出登录清除草稿。字段冲突展示本地/远端值并等待用户选择；明确拒绝保留内容，可重新核对或放弃草稿。超时暂停该 Ticket 后续发送并按编号查询/回读，仍允许编辑；已写入但 Octo 同步失败显示“已保存，待同步”，重试只同步。存储不可用会提示，关闭标签不承诺草稿恢复。

六属性调用新批量接口，解决方案继续原手动保存接口。接口示例、结果状态、兼容及并发限制见[接入契约](../docs/tenways-octo/lark-ticket-batched-save.md)。合成浏览器检查：

```bash
OCTO_FIELD_BROWSER_EXECUTABLE=/opt/google/chrome/chrome pnpm --dir fe exec node manual-tests/lark-ticket-batched-save.browser.mjs
```

该检查不验证真实账号、Lark 写入或部署。旧 `lark-ticket-field-edits.browser.mjs` 记录逐字段发送/失败回滚的旧行为，当前批量保存验收使用新脚本；当前证据及范围见[任务记录](../docs/tasks/platform-data/2026-11-06-lark-ticket-batched-autosave.md)。

## 共享颜色主题

`src/styles/global.css` 定义基础色、语义色和组件色三层变量。主操作使用琥珀品牌色，辅助信息使用青绿，正文/背景/边框使用中性色，业务状态使用独立状态色。组件优先引用语义变量，已有变量保留兼容映射。具体用法及 Lark App 应用范围见 [配色说明](docs/lark-ticket-app.md#颜色变量维护)。


## Shadow Wiki 参考

Shadow 分析展示服务端返回的 Wiki 状态：已参考资料、未召回相关资料，或“Wiki 不可用，本次仅基于聊天分析”。来源使用 `[W1]` 标记，展示标题、仓库相对来源路径、草稿/历史参考状态及适用限制；新结果可来自 `docs/llm-wiki/...` 或只读 `docs/ontology/...`，旧结果的 `concepts/...` 相对路径继续按 llm-wiki 展示。原始 Wiki 摘录不通过 Shadow Web 投影返回。旧记录无 Wiki 字段时保持原展示。正式问题总结本轮只共用 thread 处理，不增加 Wiki 召回。
