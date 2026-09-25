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

## Lark Ticket AI 应用

`#lark-app-thread-analysis` 提供适合 Lark 侧栏的只读分析页面，复用已有 Ticket AI / Shadow AI；
Ticket 详情页可通过“打开 Ticket AI 小窗”进入。顶部常驻标题搜索框，选择 Ticket 即可查看或切换分析。输入框菜单配置见
[接入说明](docs/lark-ticket-app.md)。

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

## 共享颜色主题

`src/styles/global.css` 定义基础色、语义色和组件色三层变量。主操作使用琥珀品牌色，辅助信息使用青绿，正文/背景/边框使用中性色，业务状态使用独立状态色。组件优先引用语义变量，已有变量保留兼容映射。具体用法及 Lark App 应用范围见 [配色说明](docs/lark-ticket-app.md#颜色变量维护)。


## Shadow Wiki 参考

Shadow 分析展示服务端返回的 Wiki 状态：已参考资料、未召回相关资料，或“Wiki 不可用，本次仅基于聊天分析”。来源使用 `[W1]` 标记，展示标题、来源路径、草稿/历史参考状态及适用限制；原始 Wiki 摘录不通过 Shadow Web 投影返回。旧记录无 Wiki 字段时保持原展示。正式问题总结本轮只共用 thread 处理，不增加 Wiki 召回。
