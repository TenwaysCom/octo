---
title: "新用户 Meegle 授权未进入 exchange 排查"
module: "platform-auth"
status: done
requirement_version: 4
created_on: 2026-09-02
updated_on: 2026-09-18
closed_on: 2026-09-03
owner: TBD
related:
  - "2026-09-02 affected master user (identifier redacted)"
---

# 新用户 Meegle 授权未进入 exchange 排查

## 目标

定位一名新用户 Meegle 授权未完成的失败阶段，并修复浏览器工具栏的 Meegle 首次授权入口。

## 验收标准

- [x] 确认用户身份与 Meegle 绑定是否已建立
- [x] 确认服务端是否收到 auth-code exchange 请求
- [x] 确认首次授权入口死循环的最终根因
- [x] 当前标签页为 Meegle 时，“授权 Meegle”直接调用 `popupApp.authorizeMeegle`
- [x] 当前标签页非 Meegle 时，仅显示“打开 Meegle”并执行导航
- [x] 扩展版本更新为 `0.9.1`
- [x] 工具栏入口的行为与文案回归测试通过

## 背景与范围

授权正常链路为 Meegle 页面身份解析、浏览器 content script 获取一次性 auth code、background 请求 `/api/meegle/auth/exchange`、Server 写入 `user_tokens`。日志检查只提取时间、路由、状态、阶段和布尔存在性，不读取或记录 token、cookie、用户资料或原始响应体。

## 方案与决策

- 用户在 2026-09-02 18:28 首次从 Meegle 页面成功解析为 active master user；Meegle user key 与 base URL 绑定均存在。
- 18:28 至 18:40 的 8 次 `/api/meegle/auth/status` 全部返回 `require_auth_code / No stored Meegle token found`；该用户没有 `/api/meegle/auth/exchange` 请求。
- PostgreSQL 只读查询确认该用户没有 `user_tokens` 或 `oauth_sessions` 记录，因此不是 exchange 后写入丢失或 token 立即过期。
- Meegle user key 是 Popup 初始化时从当前页面上下文自动读取并用于 identity resolve 的，不代表 auth-code 授权已经开始。
- 已替代判断：v2 曾把“插件 Icon”理解为页面悬浮 Icon；用户进一步澄清实际点击的是浏览器工具栏插件 Icon，而页面悬浮入口在该页面不可见。
- 最终根因：工具栏“授权 Meegle”只打开 Meegle 首页，不调用 auth bridge；首页、`/workbench` 和 `/b/mcp` 均命中 `meegle.unmatched`，其 page config 禁用 sidebar 且没有 sidebar action，因此页面悬浮入口不会出现。首次授权用户只能看到一个不授权的“授权”按钮，形成入口死循环，所以不会产生 auth code 或 exchange。
- 悬浮入口不可见并不是 `isAuthed` 直接控制；当前直接条件是 Server page config 的 `injectPageElements`、sidebar placement 和 `sidebarButtonEnabled`。未授权新用户通常停留在 unmatched 页面，使现象看起来像授权门禁。
- 已排除 `MEEGLE_PLUGIN_ID` 的测试环境服务端配置缺失：部署环境同时配置了 Plugin ID 与 secret；公开配置接口的实时安全布尔检查返回 `ok=true`、Plugin ID 存在，且 Lark callback 与 test Server origin 匹配，因此 `getConfig()` 不会因跨环境 callback 校验而丢弃该公开配置。
- v4 按当前标签页类型拆分工具栏入口：Meegle 页调用真实 auth bridge；其他页面仅导航到 Meegle，并使用“打开 Meegle”文案。扩展版本同步更新为 `0.9.1`。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-02 | v1 | completed | API 日志、应用日志、授权入口代码与 PostgreSQL 聚合只读检查均把问题定位在 Server exchange 之前 | 未取得受影响浏览器的 background/content-script 本地日志；本次未修改误导性入口或遥测 |
| 2026-09-02 | v2 | in_progress | 用户确认已点击悬浮 Profile 授权按钮；排除“只点击工具栏跳转”作为最终根因，进一步定位到客户端 auth-code 获取区间 | 需客户端 `MEEGLE_AUTH_FLOW` 的安全阶段错误码 |
| 2026-09-02 | v2 | in_progress | 部署配置和 `/api/config/public` 实时检查均确认 Plugin ID 存在，callback 也与 test 环境匹配；排除 Server 公开配置缺失 | 仍需受影响浏览器的具体 auth-code 请求错误 |
| 2026-09-02 | v3 | completed | 用户澄清点击的是工具栏插件 Icon；代码与 page config 日志确认工具栏只跳转到 unmatched 首页，而真正授权入口不会注入，首次授权流程形成死循环 | 修复入口和增加回归测试属于后续实现范围 |
| 2026-09-03 | v4 | completed | 工具栏入口已按 `pageType` 分流，Meegle 页直接调用 `popupApp.authorizeMeegle`；非 Meegle 页的按钮和提示明确标为打开页面；manifest 版本及构建产物均为 `0.9.1` | 自动化验证完成；尚未使用真实账号执行浏览器首次授权闭环 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 运行时日志 | 通过 | 8 次 status 检查均要求 auth code；0 次该用户 exchange | Server 看不到浏览器本地 pre-exchange 错误 |
| PostgreSQL 只读检查 | 通过 | active 用户与 Meegle 绑定存在；token/session 行均不存在 | 未读取任何凭证或用户资料字段 |
| 静态代码检查 | 通过 | 工具栏按 `pageType` 分流真实授权与导航，非 Meegle 页不再显示“授权 Meegle” | 未执行真实浏览器授权 |
| 定向单测 | 通过 | `App.test.ts` 与 `ToolbarPopupView.test.ts` 共 7 项通过，覆盖两种行为和文案 | 使用 Chrome API mock，不包含真实 auth code |
| Extension 全量测试 | 通过 | 45 个测试文件、282 项测试通过 | 不包含 Playwright 实机登录 |
| 类型检查 / 生产构建 | 通过 | `pnpm --dir extension typecheck` 与 `pnpm --dir extension build`；构建 manifest 为 `0.9.1` | 未打 zip 或发布 |

## 关联

- `extension/src/toolbar-popup/App.tsx`
- `extension/src/popup-shared/popup-controller.ts`
- `extension/src/background/handlers/meegle-auth.ts`
- `docs/ai-dev/lifecycle/current-system-technical-objects.md`

## 2026-09-18 版本兼容性复核

- 用户询问 0.9.1 发布后 0.8.2 授权失败是否由认证协议变化导致。本次仅比较源码，不修改认证行为。
- 比较 Git 标签 `0.8.2` 与 `0.9.1`：工具栏从仅 `chrome.tabs.create` 导航改为在 Meegle 页调用 `popupApp.authorizeMeegle()`；非 Meegle 页仍导航。`v0.8.2` 与 `0.8.2` 标签不同，但其差异不涉及此认证链路。
- 两版本的 `extension/src/background/handlers/meegle-auth.ts`、`extension/src/page-bridge/meegle-auth.ts`、`extension/src/popup/meegle-auth.ts`、Server `modules/meegle-auth/`、`adapters/meegle/auth-adapter.ts`、`application/services/meegle-credential.service.ts`、`adapters/postgres/meegle-token-store.ts` 无差异；exchange/status 路由与 Meegle API 的身份头要求保留。
- 0.9.1 增加公开配置来源校验，避免跨 Server origin 复用配置；默认 prod/test/dev 地址未变化。新增 Web 登录与 CORS credential 支持未将旧 Meegle exchange 改为 Web session 认证，未发现按扩展版本拒绝旧客户端的认证改动。
- 判断边界：旧版工具栏只跳转的问题确实存在，但不能据此认定本次用户故障根因。若既有 token 失效或环境切换导致需重新授权，可能暴露该旧入口问题；这些触发因素未取得本次运行时证据。若用户通过页面悬浮入口执行授权仍失败，需要按失败时间、环境、错误码和 exchange 请求定位。
- 验证：完成上述 Git 差异静态核对；未运行单测、mock integration、live E2E 或本次受影响账号的部署日志核对。此前 9 月 2 日日志只证明历史事件，不作为本次故障证据。
- 用户进一步明确组合为 **0.8.2 Extension + 0.10.0 Server**。补充比较 `0.8.2..0.10.0`：上述 Meegle 认证 controller/DTO/service、auth adapter、credential service、PG token store 仍无差异；identity 模块未变，exchange/status 路由保留，API 身份头要求未变。未发现由版本号直接触发的认证拒绝。
- 对本地现有日志仅提取安全聚合：2026-09-18 API 日志有 6 次 status（HTTP 200）、无 exchange；应用日志有 4 次 status ready、2 次 `NO_STORED_TOKEN`。这些记录尚未匹配用户的环境、失败时间、插件版本或部署版本，不能用于认定本次根因；HTTP 200 也不等于已经授权。已请求用户提供环境、失败时间和错误文字，继续定位需要该关联信息。
- 用户明确故障为 prod、2026-09-17 下午，并确认生产日志目录 `/home/deploy/projects/octo/server/logs`。读取该目录当日 API、app、popup-client 日志：全天 status 153 次均 HTTP 200；exchange 仅 11:22:14 一次，应用日志确认 `EXCHANGE OK` 且 `stored_token`。下午没有 exchange 请求。一名匿名用户全天 38 次 `NO_STORED_TOKEN`，下午 14:04:33 至 18:51:57 持续出现；另有用户出现 `MISSING_MEEGLE_USER_KEY`。时间为 logger 的 Asia/Shanghai，与用户时区同为 UTC+8。
- 本次生产证据把下午故障范围缩小到 exchange 到达服务端之前，而非服务端收到授权码后拒绝旧版本。没有存储 token 仅说明当时查不到对应授权，不足以断言过期、丢失或清库。候选用户尚未由用户确认；日志也未记录其插件版本或实际点击入口。popup-client 当天只有 `activePage.changed`（插件内部页面切换），不能据此推断浏览器位于 Meegle 首页，也没有 auth bridge 失败阶段证据。0.8.2 工具栏入口缺陷仍是待浏览器确认的解释，不能把历史根因直接当作本次已证实根因。

### Meegle / Lark 授权变化补充审计

- 范围为标签 `0.8.2 → 0.9.1`，并复核 `0.9.1 → 0.10.0`。后一个区间中两平台 auth 模块、插件 background/toolbar/popup-shared 及两平台 PG token store 无变化；公共配置的额外变化涉及业务 action 元数据。
- Meegle 用户标识仍为 `meegleUserKey`，auth code bridge、exchange/status DTO、凭证刷新和 token store 不变。入口修复之外，共享 `getConfig()` 新增来源校验；不匹配时会清除缓存的 Meegle Plugin ID，且新公开配置需通过 Lark App ID / callback 校验才接受。因此 Lark 配置错误可能间接影响新版 Meegle 配置加载，不能将 Meegle 描述为完全没有变化。该校验位于新版插件，不能直接解释旧插件独有故障。
- 扩展 host permissions 增加 Octo prod/test 域名；Lark 专用 callback content script 从只匹配 localhost 改为匹配 prod/test/dev 与额外配置域名。其用途是向 background 通知授权完成，不代表旧版服务端必然无法存 token。
- Lark background ensure handler 主体不变，但 router 新增配置前置拦截：`LARK_PUBLIC_CONFIG_UNAVAILABLE`、`LARK_OAUTH_CONFIG_ENVIRONMENT_MISMATCH`。服务端新增 Web OAuth/session/plugin-login 分支，已有带 masterUserId 的插件 OAuth session 继续进入原插件回调分支。
- Lark 服务端把用户信息、身份绑定、token 用户标识及通讯录查询从 `user_id` 改为 `open_id`；通讯录回包解析同时修复嵌套 `data.user` 和企业邮箱回退。
- **静态确认的契约不一致**：`getLarkUserInfoController` 的 `/api/lark/user-info` 从返回 `data.userId` 改为 `data.openId`；但 0.8.2、0.9.1 的 `extension/src/popup/runtime.ts::fetchLarkUserInfo` 与 `popup-shared/popup-controller.ts::hydrateLarkIdentityFromServer` 仍声明/读取 `data.userId`。新服务端搭配这两个插件版本时，此处无法回填新 Lark ID，只保留原值；不能由此推断 token exchange 必然失败，更不能直接认定为此次 Meegle 故障原因。
- 此次仅完成源码审计、文档记录和 diff 格式检查，未修复上述契约、修改生产数据或运行真实浏览器验证。
