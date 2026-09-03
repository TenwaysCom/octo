---
title: "新用户 Meegle 授权未进入 exchange 排查"
module: "platform-auth"
status: completed
requirement_version: 4
created_on: 2026-09-02
updated_on: 2026-09-03
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
